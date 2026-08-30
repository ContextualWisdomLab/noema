import {
  closeSync,
  constants,
  existsSync,
  fchmodSync,
  fstatSync,
  ftruncateSync,
  lstatSync,
  mkdtempSync,
  openSync,
  rmSync,
  unlinkSync,
  writeFileSync as fsWriteFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { writeAcquisitionPrivateFile } from "../scripts/lib/acquisition-private-output.mjs";

describe("acquisition private output new-file failure cleanup", () => {
  it.skipIf(process.platform === "win32")(
    "retains the partial leaf when exact-object deletion is unavailable after a failed write",
    () => {
      const directory = mkdtempSync(join(tmpdir(), "noema-private-new-failure-"));
      const output = join(directory, "evidence.json");
      const fileSystem = {
        constants,
        lstatSync,
        openSync,
        fstatSync,
        fchmodSync,
        ftruncateSync,
        closeSync,
        unlinkSync,
        writeFileSync(descriptor: number) {
          fsWriteFileSync(descriptor, "partial\n", { encoding: "utf8" });
          throw new Error("simulated acquisition write failure");
        },
      };

      try {
        expect(() => writeAcquisitionPrivateFile(output, "complete\n", fileSystem as never))
          .toThrow("simulated acquisition write failure");
        // A pathname lstat followed by pathname unlink cannot prove that the
        // same inode is still named there if an ancestor or the leaf races.
        // Without an exact-object deletion primitive, retaining the failed
        // 0600 leaf is safer than risking deletion of a replacement object.
        expect(existsSync(output)).toBe(true);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
  );

  it.skipIf(process.platform === "win32")(
    "never unlinks an unauthenticated new pathname when descriptor identity cannot be established",
    () => {
      const directory = mkdtempSync(join(tmpdir(), "noema-private-new-identity-failure-"));
      const output = join(directory, "evidence.json");
      const fileSystem = {
        constants,
        lstatSync,
        openSync,
        fstatSync() {
          throw new Error("simulated descriptor identity failure");
        },
        fchmodSync,
        ftruncateSync,
        closeSync,
        unlinkSync,
        writeFileSync: fsWriteFileSync,
      };

      try {
        expect(() => writeAcquisitionPrivateFile(output, "complete\n", fileSystem as never))
          .toThrow("simulated descriptor identity failure");
        expect(existsSync(output)).toBe(true);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
  );
});