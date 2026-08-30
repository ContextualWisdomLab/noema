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

function createTokenFile(token: string) {
  const directory = mkdtempSync(join(tmpdir(), "noema-token-content-canonicality-"));
  temporaryDirectories.push(directory);
  const tokenPath = join(directory, "maintainer-token");
  writeFileSync(tokenPath, token, { encoding: "utf8", mode: 0o600 });
  chmodSync(tokenPath, 0o600);
  return tokenPath;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("delegated GitHub token content canonicality", () => {
  it.each([
    " short-lived-maintainer-token",
    "short-lived-maintainer-token ",
    "short lived maintainer token",
    "short-lived-maintainer-token\u00a0",
  ])("fails closed on whitespace-bearing token authority: %j", (token) => {
    const tokenPath = createTokenFile(token);

    expect(() => readDelegatedGithubToken(tokenPath)).toThrow(
      "Maintainer token must use canonical bearer-token bytes.",
    );
  });

  it("continues to accept canonical GitHub bearer-token bytes", () => {
    const tokenPath = createTokenFile("ghs_example-token._~+/=");

    expect(readDelegatedGithubToken(tokenPath)).toBe("ghs_example-token._~+/=");
  });
});
