import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { writeAcquisitionPrivateFile } from "../scripts/lib/acquisition-private-output.mjs";

describe("acquisition private output lexical path authority", () => {
  it.skipIf(process.platform === "win32")(
    "rejects dot-segment paths before a symlink ancestor can redirect the write",
    () => {
      const root = mkdtempSync(join(tmpdir(), "noema-private-lexical-authority-"));
      const attacker = join(root, "attacker");
      const attackerInner = join(attacker, "inner");
      const attackerSafe = join(attacker, "safe");
      const legitimateSafe = join(root, "safe");
      const linked = join(root, "linked");
      const redirectedOutput = join(attackerSafe, "evidence.json");
      const legitimateOutput = join(legitimateSafe, "evidence.json");
      const rawDotSegmentPath = `${linked}/../safe/evidence.json`;

      try {
        mkdirSync(attackerInner, { recursive: true });
        mkdirSync(attackerSafe, { recursive: true });
        mkdirSync(legitimateSafe, { recursive: true });
        symlinkSync(attackerInner, linked, "dir");
        writeFileSync(join(attackerSafe, "sentinel.txt"), "attacker-parent\n", "utf8");

        expect(() => writeAcquisitionPrivateFile(rawDotSegmentPath, "buyer-evidence\n"))
          .toThrow("lexically canonical");
        expect(existsSync(redirectedOutput)).toBe(false);
        expect(existsSync(legitimateOutput)).toBe(false);
        expect(readFileSync(join(attackerSafe, "sentinel.txt"), "utf8"))
          .toBe("attacker-parent\n");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
});
