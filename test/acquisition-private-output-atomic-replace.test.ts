import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  ftruncateSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { writeAcquisitionPrivateFile } from "../scripts/lib/acquisition-private-output.mjs";

describe.skipIf(process.platform === "win32")(
  "acquisition private output atomic replacement",
  () => {
    it("preserves trusted existing evidence when replacement bytes cannot be written", () => {
      const root = mkdtempSync(join(tmpdir(), "noema-private-atomic-"));
      const output = join(root, "evidence.json");
      try {
        writeFileSync(output, "trusted-evidence\n", { encoding: "utf8", mode: 0o600 });
        const failingFileSystem = {
          closeSync,
          constants,
          fchmodSync,
          fstatSync,
          ftruncateSync,
          lstatSync,
          openSync,
          renameSync,
          unlinkSync,
          writeFileSync() {
            throw new Error("synthetic replacement write failure");
          },
        };

        expect(() => writeAcquisitionPrivateFile(
          output,
          "replacement-evidence\n",
          failingFileSystem as never,
        )).toThrow("synthetic replacement write failure");
        expect(readFileSync(output, "utf8")).toBe("trusted-evidence\n");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it("neutralizes the writer-owned replacement if its version changes after atomic rename", () => {
      const root = mkdtempSync(join(tmpdir(), "noema-private-post-rename-"));
      const output = join(root, "evidence.json");
      try {
        writeFileSync(output, "trusted-evidence\n", { encoding: "utf8", mode: 0o600 });
        let renameObserved = false;
        const mutatingFileSystem = {
          closeSync,
          constants,
          fchmodSync,
          fstatSync,
          ftruncateSync,
          lstatSync,
          openSync,
          renameSync(source: string, destination: string) {
            renameSync(source, destination);
            renameObserved = true;
            const descriptor = openSync(
              destination,
              constants.O_RDONLY | constants.O_NOFOLLOW,
            );
            try {
              fchmodSync(descriptor, 0o640);
            } finally {
              closeSync(descriptor);
            }
          },
          unlinkSync,
          writeFileSync,
        };

        expect(() => writeAcquisitionPrivateFile(
          output,
          "replacement-evidence\n",
          mutatingFileSystem as never,
        )).toThrow("acquisition output path changed during atomic replacement");
        expect(renameObserved).toBe(true);
        expect(lstatSync(output, { throwIfNoEntry: false })).toBeDefined();
        expect(readFileSync(output, "utf8")).toBe("");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it("rejects a concurrent same-target writer before it can replace trusted evidence", () => {
      const root = mkdtempSync(join(tmpdir(), "noema-private-concurrent-"));
      const output = join(root, "evidence.json");
      try {
        writeFileSync(output, "trusted-evidence\n", { encoding: "utf8", mode: 0o600 });
        let nestedError: unknown;
        const interleavingFileSystem = {
          closeSync,
          constants,
          fchmodSync,
          fstatSync,
          ftruncateSync,
          lstatSync,
          openSync,
          renameSync(source: string, destination: string) {
            try {
              writeAcquisitionPrivateFile(output, "newer-evidence\n");
            } catch (error) {
              nestedError = error;
            }
            renameSync(source, destination);
          },
          unlinkSync,
          writeFileSync,
        };

        writeAcquisitionPrivateFile(
          output,
          "serialized-evidence\n",
          interleavingFileSystem as never,
        );
        expect(nestedError).toBeInstanceOf(Error);
        expect((nestedError as Error).message).toMatch(/writer already active/i);
        expect(readFileSync(output, "utf8")).toBe("serialized-evidence\n");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  },
);
