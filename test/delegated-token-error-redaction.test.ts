import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readDelegatedGithubToken } from "../scripts/lib/delegated-github-token.mjs";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("delegated token capability error redaction", () => {
  it("redacts a classic GitHub credential split by an ASCII control before publishing an open error", () => {
    const directory = mkdtempSync(join(tmpdir(), "noema-token-redaction-"));
    directories.push(directory);
    const credentialBody = "SECRETBODY123";
    const missingPath = join(directory, `ghp_\n${credentialBody}`);

    let message = "";
    try {
      readDelegatedGithubToken(missingPath);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain("[REDACTED]");
    expect(message).not.toContain("ghp_");
    expect(message).not.toContain(credentialBody);
  });
});
