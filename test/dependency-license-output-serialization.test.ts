import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generateDependencyLicenseInventory } from "../scripts/dependency-license-inventory.mjs";

const temporaryRoots: string[] = [];

function sri512(label: string) {
  return `sha512-${createHash("sha512").update(label).digest("base64")}`;
}

function lockfileBytes() {
  return `${JSON.stringify({
    name: "noema",
    version: "0.1.0",
    lockfileVersion: 3,
    requires: true,
    packages: {
      "": { name: "noema", version: "0.1.0" },
      "node_modules/alpha": {
        version: "1.0.0",
        resolved: "https://registry.npmjs.org/alpha/-/alpha-1.0.0.tgz",
        integrity: sri512("alpha"),
        license: "MIT",
      },
    },
  }, null, 2)}\n`;
}

afterEach(() => {
  while (temporaryRoots.length > 0) {
    const root = temporaryRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("dependency license output serialization", () => {
  it("preserves prior evidence while the canonical target writer lease is held", () => {
    const root = mkdtempSync(join(tmpdir(), "noema-license-writer-lease-"));
    temporaryRoots.push(root);
    const lockPath = join(root, "package-lock.json");
    const outputPath = join(root, "dependency-licenses.json");
    const priorEvidence = "trusted prior evidence\n";
    writeFileSync(lockPath, lockfileBytes(), "utf8");
    writeFileSync(outputPath, priorEvidence, { encoding: "utf8", mode: 0o600 });

    const absoluteOutputPath = resolve(outputPath);
    const writerLockDigest = createHash("sha256").update(absoluteOutputPath).digest("hex");
    const writerLockPath = join(
      dirname(absoluteOutputPath),
      `.noema-acquisition-writer-${writerLockDigest}.lock`,
    );
    writeFileSync(writerLockPath, "active writer lease\n", { encoding: "utf8", mode: 0o600 });

    expect(() => generateDependencyLicenseInventory({ lockPath, outputPath })).toThrow();
    expect(readFileSync(outputPath, "utf8")).toBe(priorEvidence);
  });
});
