import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

const swapState = vi.hoisted(() => ({
  sourcePath: "",
  backupPath: "",
  outsideDir: "",
  swapped: false,
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...original,
    async lstat(path: Parameters<typeof original.lstat>[0], options?: unknown) {
      const result = await (original.lstat as (...args: unknown[]) => Promise<unknown>)(path, options);
      const candidate = typeof path === "string" ? path : path.toString();
      if (!swapState.swapped && swapState.sourcePath && candidate === swapState.sourcePath) {
        swapState.swapped = true;
        await original.rename(swapState.sourcePath, swapState.backupPath);
        await original.symlink(swapState.outsideDir, swapState.sourcePath, "dir");
      }
      return result;
    },
  };
});

import { copyInputTree } from "../.github/codegraph/sandbox-runner.mjs";

function tempRoot(prefix: string) {
  return mkdtempSync(join(tmpdir(), prefix));
}

describe("CodeGraph directory descriptor binding", () => {
  it("never traverses a directory pathname swapped after metadata validation", async () => {
    const root = tempRoot("noema-sandbox-directory-race-");
    const input = join(root, "input");
    const output = join(root, "output");
    const nested = join(input, "nested");
    const nestedBackup = join(input, "nested-original");
    const outside = join(root, "outside");
    mkdirSync(nested, { recursive: true });
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(nested, "safe.txt"), "safe");
    writeFileSync(join(outside, "outside-secret.txt"), "outside-secret");

    Object.assign(swapState, {
      sourcePath: nested,
      backupPath: nestedBackup,
      outsideDir: outside,
      swapped: false,
    });

    await expect(copyInputTree(input, output)).rejects.toThrow();

    expect(swapState.swapped).toBe(true);
    expect(() => readFileSync(join(output, "nested", "outside-secret.txt"), "utf8")).toThrow();
  });
});
