import { lstatSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generateDependencyLicenseInventory } from "../scripts/dependency-license-inventory.mjs";

const temporaryRoots: string[] = [];

afterEach(() => {
  while (temporaryRoots.length > 0) {
    const root = temporaryRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

function lockfileBytes() {
  return `${JSON.stringify({
    name: "noema",
    version: "0.1.0",
    lockfileVersion: 3,
    requires: true,
    packages: {
      "": {
        name: "noema",
        version: "0.1.0",
      },
      "node_modules/alpha": {
        version: "1.0.0",
        resolved: "https://registry.npmjs.org/alpha/-/alpha-1.0.0.tgz",
        integrity: "sha512-alpha",
        license: "MIT",
      },
    },
  }, null, 2)}\n`;
}

describe("dependency license inventory special-file output authority", () => {
  it("refuses to unlink an existing Unix socket at the evidence output path", async () => {
    if (process.platform === "win32") return;

    const root = mkdtempSync(join(tmpdir(), "noema-license-special-output-"));
    temporaryRoots.push(root);
    const lockPath = join(root, "package-lock.json");
    const outputPath = join(root, "dependency-licenses.sock");
    writeFileSync(lockPath, lockfileBytes(), "utf8");

    const server = createServer();
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => reject(error);
      server.once("error", onError);
      server.listen(outputPath, () => {
        server.off("error", onError);
        resolve();
      });
    });

    try {
      expect(lstatSync(outputPath).isSocket()).toBe(true);
      expect(() => generateDependencyLicenseInventory({ lockPath, outputPath })).toThrow(
        "dependency license inventory output must be a regular file",
      );
      expect(lstatSync(outputPath).isSocket()).toBe(true);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
