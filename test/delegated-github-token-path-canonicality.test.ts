import {
  chmodSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, sep } from "node:path";
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

  it("rejects lexical aliases instead of granting the same credential inode multiple configured path authorities", () => {
    const tokenPath = createTokenFile();
    const dotSegmentAlias = `${dirname(tokenPath)}${sep}.${sep}${basename(tokenPath)}`;
    const relativeAlias = relative(process.cwd(), tokenPath);

    for (const alias of [dotSegmentAlias, relativeAlias]) {
      expect(alias).not.toBe(tokenPath);
      expect(() => readDelegatedGithubToken(alias)).toThrow(
        "Maintainer token file path must be canonical.",
      );
    }
  });

  it.each([
    (path: string) => new String(path),
    (path: string) => ({ toString: () => path }),
  ])("rejects non-string path authority instead of coercing it to a filesystem capability", (wrapPath) => {
    const tokenPath = createTokenFile();
    const nonStringPath = wrapPath(tokenPath);

    expect(() => readDelegatedGithubToken(nonStringPath as unknown as string)).toThrow(
      "Maintainer token file path must be a string.",
    );
  });

  it("continues to accept the exact canonical capability path", () => {
    const tokenPath = createTokenFile();

    expect(readDelegatedGithubToken(tokenPath)).toBe("short-lived-maintainer-token");
  });
});
