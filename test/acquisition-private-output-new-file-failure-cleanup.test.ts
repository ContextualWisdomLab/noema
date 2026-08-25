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
    "removes the identity-matched partial leaf when a new private write fails",
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
        expect(existsSync(output)).toBe(false);
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
