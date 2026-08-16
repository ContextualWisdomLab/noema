import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { copyInputTree } from "../.github/codegraph/sandbox-runner.mjs";

function tempRoot(prefix: string) {
  return mkdtempSync(join(tmpdir(), prefix));
}

function mutationLimits(mutate: () => void) {
  let mutated = false;
  return {
    get maxFiles() {
      if (!mutated) {
        mutate();
        mutated = true;
      }
      return 10;
    },
    maxFileBytes: 1024,
    maxTotalBytes: 4096,
    wasMutated: () => mutated,
  };
}

describe("CodeGraph stable file snapshots", () => {
  it("rejects a file that grows after its descriptor is opened", async () => {
    const root = tempRoot("noema-sandbox-growth-race-");
    const input = join(root, "input");
    const output = join(root, "output");
    const sourcePath = join(input, "source.txt");
    const outputPath = join(output, "source.txt");
    mkdirSync(input);
    writeFileSync(sourcePath, "safe");

    const limits = mutationLimits(() => appendFileSync(sourcePath, "-growth"));

    await expect(copyInputTree(input, output, limits)).rejects.toThrow(
      "input grew during read",
    );
    expect(limits.wasMutated()).toBe(true);
    expect(() => readFileSync(outputPath, "utf8")).toThrow();
  });

  it("rejects same-size content replacement after its descriptor is opened", async () => {
    const root = tempRoot("noema-sandbox-same-size-race-");
    const input = join(root, "input");
    const output = join(root, "output");
    const sourcePath = join(input, "source.txt");
    const outputPath = join(output, "source.txt");
    mkdirSync(input);
    writeFileSync(sourcePath, "safe");

    const limits = mutationLimits(() => {
      writeFileSync(sourcePath, "evil");
      utimesSync(sourcePath, new Date(0), new Date(0));
    });

    await expect(copyInputTree(input, output, limits)).rejects.toThrow(
      "input changed during read",
    );
    expect(limits.wasMutated()).toBe(true);
    expect(() => readFileSync(outputPath, "utf8")).toThrow();
  });
});
