import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createGhSubprocessEnvironment,
  readDelegatedGithubToken,
  redactSensitiveValue,
} from "../scripts/maintainer-app-readiness.mjs";

describe("maintainer App GitHub CLI authority and diagnostics", () => {
  it("passes only the explicit GitHub CLI child authority", () => {
    const child = createGhSubprocessEnvironment({
      PATH: "/usr/local/bin:/usr/bin",
      GH_TOKEN: "synthetic-maintainer-token",
      GITHUB_TOKEN: "synthetic-ambient-token",
      NVIDIA_NIM_API_KEY: "synthetic-model-key",
      REVIEWER_APP_PRIVATE_KEY: "synthetic-reviewer-key",
      MAINTAINER_APP_PRIVATE_KEY: "synthetic-maintainer-key",
      CLOUDFLARE_API_TOKEN: "synthetic-cloudflare-token",
      HTTPS_PROXY: "https://proxy.invalid",
      HOME: "/home/runner",
      NODE_OPTIONS: "--require hostile.js",
    });

    expect(child).toEqual({
      GH_HOST: "github.com",
      NO_COLOR: "1",
      PATH: "/usr/local/bin:/usr/bin",
      GH_TOKEN: "synthetic-maintainer-token",
    });
  });

  it("loads delegated GitHub authority only from an explicit token-file boundary", () => {
    const directory = mkdtempSync(join(tmpdir(), "noema-maintainer-token-"));
    const tokenPath = join(directory, "token");
    try {
      writeFileSync(tokenPath, "synthetic-maintainer-token", { encoding: "utf8", mode: 0o600 });
      expect(readDelegatedGithubToken(tokenPath)).toBe("synthetic-maintainer-token");
      expect(() => readDelegatedGithubToken("")).toThrow(/token file path is required/i);
      writeFileSync(tokenPath, "synthetic-maintainer-token\n", { encoding: "utf8", mode: 0o600 });
      expect(() => readDelegatedGithubToken(tokenPath)).toThrow(/control characters/i);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("redacts every exact delegated-token occurrence before diagnostics are bounded", () => {
    expect(
      redactSensitiveValue(
        "request synthetic-maintainer-token failed: synthetic-maintainer-token",
        ["synthetic-maintainer-token", ""],
      ),
    ).toBe("request [REDACTED] failed: [REDACTED]");
  });

  it("requires the production runGh boundary to use explicit delegated authority", () => {
    const source = readFileSync("scripts/maintainer-app-readiness.mjs", "utf8");

    expect(source).toContain("readDelegatedGithubToken");
    expect(source).not.toContain("process.env.GH_TOKEN");
    expect(source).toContain("GH_TOKEN: delegatedGithubToken");
    expect(source).toContain("env: childEnvironment");
    expect(source).toContain(
      "redactSensitiveValue(completed.error.message, [childEnvironment.GH_TOKEN])",
    );
    expect(source).toContain(
      "redactSensitiveValue(rawDetail, [childEnvironment.GH_TOKEN])",
    );
  });
});
