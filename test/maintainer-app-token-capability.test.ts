import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readDelegatedGithubToken } from "../scripts/maintainer-app-readiness.mjs";

const directories: string[] = [];

function tokenFile(contents: string) {
  const directory = mkdtempSync(join(tmpdir(), "noema-maintainer-token-"));
  directories.push(directory);
  const path = join(directory, "token");
  writeFileSync(path, contents, { encoding: "utf8", mode: 0o600 });
  return path;
}

function missingTokenPath() {
  const directory = mkdtempSync(join(tmpdir(), "noema-maintainer-token-missing-"));
  directories.push(directory);
  return join(directory, "not-created");
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("delegated Maintainer App token capability", () => {
  it("rejects an absent capability path before attempting filesystem access", () => {
    expect(() => readDelegatedGithubToken(undefined)).toThrow(/token file path is required/i);
  });

  it("rejects an unreadable capability path with bounded filesystem diagnostics", () => {
    expect(() => readDelegatedGithubToken(missingTokenPath())).toThrow(/could not be read/i);
  });

  it("rejects an empty capability file", () => {
    expect(() => readDelegatedGithubToken(tokenFile(""))).toThrow(/must not be empty/i);
  });

  it.each(["token\n", "token\r", "token\u0000suffix", "token\u007fsuffix"])(
    "rejects control characters in delegated authority: %j",
    (contents) => {
      expect(() => readDelegatedGithubToken(tokenFile(contents))).toThrow(/control characters/i);
    },
  );

  it("returns the exact non-empty token bytes decoded as UTF-8 text without trimming", () => {
    expect(readDelegatedGithubToken(tokenFile("delegated-token-value"))).toBe(
      "delegated-token-value",
    );
  });
});
