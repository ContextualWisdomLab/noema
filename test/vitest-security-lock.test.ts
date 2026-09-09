import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type LockPackage = {
  version?: string;
  devDependencies?: Record<string, string>;
};

type PackageLock = {
  packages?: Record<string, LockPackage>;
};

const MINIMUM_SAFE_VITEST = [4, 1, 11] as const;

function parseStableVersion(version: string): readonly [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`Expected a stable semver, received ${version}`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersion(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
): number {
  for (let index = 0; index < left.length; index += 1) {
    const difference = left[index] - right[index];
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

function requirePackage(lock: PackageLock, path: string): LockPackage {
  const entry = lock.packages?.[path];
  if (!entry) {
    throw new Error(`Missing ${path} from package-lock.json`);
  }
  return entry;
}

describe("Vitest security lock", () => {
  const lock = JSON.parse(
    readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"),
  ) as PackageLock;

  it("keeps direct Vitest requirements on the patched 4.1.11 line or newer", () => {
    const root = requirePackage(lock, "");
    expect(root.devDependencies?.vitest).toBe("^4.1.11");
    expect(root.devDependencies?.["@vitest/coverage-v8"]).toBe("^4.1.11");
  });

  it.each(["node_modules/vitest", "node_modules/@vitest/mocker"])(
    "rejects CVE-2026-84373-vulnerable resolution at %s",
    (path) => {
      const version = requirePackage(lock, path).version;
      if (!version) {
        throw new Error(`Missing version for ${path}`);
      }
      expect(compareVersion(parseStableVersion(version), MINIMUM_SAFE_VITEST)).toBeGreaterThanOrEqual(0);
    },
  );
});
