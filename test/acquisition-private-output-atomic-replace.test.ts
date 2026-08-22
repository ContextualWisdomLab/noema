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
  rmSync,
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
  },
);