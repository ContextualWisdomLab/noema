import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createGhSubprocessEnvironment,
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

  it("redacts every exact delegated-token occurrence before diagnostics are bounded", () => {
    expect(
      redactSensitiveValue(
        "request synthetic-maintainer-token failed: synthetic-maintainer-token",
        ["synthetic-maintainer-token", ""],
      ),
    ).toBe("request [REDACTED] failed: [REDACTED]");
  });

  it("requires the production runGh boundary to redact startup and non-zero diagnostics", () => {
    const source = readFileSync("scripts/maintainer-app-readiness.mjs", "utf8");

    expect(source).toContain("const childEnvironment = createGhSubprocessEnvironment();");
    expect(source).toContain("env: childEnvironment");
    expect(source).toContain(
      "redactSensitiveValue(completed.error.message, [childEnvironment.GH_TOKEN])",
    );
    expect(source).toContain(
      "redactSensitiveValue(rawDetail, [childEnvironment.GH_TOKEN])",
    );
  });
});
