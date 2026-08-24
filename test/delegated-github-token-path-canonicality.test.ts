import {
  chmodSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readDelegatedGithubToken } from "../scripts/lib/delegated-github-token.mjs";

const temporaryDirectories: string[] = [];

function createTokenFile() {
  const directory = mkdtempSync(join(tmpdir(), "noema-token-path-canonicality-"));
  temporaryDirectories.push(directory);
  const tokenPath = join(directory, "maintainer-token");
  writeFileSync(tokenPath, "short-lived-maintainer-token", { encoding: "utf8", mode: 0o600 });
  chmodSync(tokenPath, 0o600);
  return tokenPath;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("delegated GitHub token capability path canonicality", () => {
  it.each([
    (path: string) => ` ${path}`,
    (path: string) => `${path} `,
    (path: string) => `\t${path}`,
    (path: string) => `${path}\n`,
  ])("fails closed instead of normalizing surrounding whitespace in the configured path", (decoratePath) => {
    const tokenPath = createTokenFile();

    expect(() => readDelegatedGithubToken(decoratePath(tokenPath))).toThrow(
      "Maintainer token file path must be canonical.",
    );
  });

  it("continues to accept the exact canonical capability path", () => {
    const tokenPath = createTokenFile();

    expect(readDelegatedGithubToken(tokenPath)).toBe("short-lived-maintainer-token");
  });
});
