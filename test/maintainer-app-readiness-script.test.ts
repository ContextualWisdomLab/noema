import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  flattenArrayPages,
  normalizeBotAccount,
} from "../scripts/maintainer-app-readiness.mjs";

describe("maintainer App readiness adapter", () => {
  it("flattens every installation repository page", () => {
    expect(flattenArrayPages([
      [{ full_name: "ContextualWisdomLab/noema" }],
      [{ full_name: "ContextualWisdomLab/other" }],
      [],
    ])).toEqual([
      { full_name: "ContextualWisdomLab/noema" },
      { full_name: "ContextualWisdomLab/other" },
    ]);
  });

  it("rejects malformed pagination envelopes", () => {
    expect(() => flattenArrayPages({})).toThrow(/array of pages/);
    expect(() => flattenArrayPages([{}])).toThrow(/page must be an array/);
  });

  it("normalizes bot suspension without retaining the full user payload", () => {
    expect(normalizeBotAccount({
      login: "noema-maintainer[bot]",
      type: "Bot",
      suspended_at: null,
      email: "secret@example.com",
    })).toEqual({
      login: "noema-maintainer[bot]",
      type: "Bot",
      suspended: false,
    });
    expect(normalizeBotAccount({
      login: "noema-maintainer[bot]",
      type: "Bot",
      suspended_at: "2026-08-03T00:00:00Z",
    }).suspended).toBe(true);
  });

  it("uses shell-free bounded GitHub reads and complete repository pagination", () => {
    const script = readFileSync("scripts/maintainer-app-readiness.mjs", "utf8");

    expect(script).toContain('spawnSync("gh"');
    expect(script).toContain("shell: false");
    expect(script).toContain("MAX_GH_OUTPUT_BYTES");
    expect(script).toContain('"api", "--paginate", "--slurp"');
    expect(script).toContain("installation/repositories?per_page=100");
    expect(script).toContain("flattenArrayPages");
    expect(script).toContain("users/${encodeURIComponent(maintainerLogin)}");
    expect(script).toContain("users/${encodeURIComponent(reviewerLogin)}");
    expect(script).toContain("actions/runs?per_page=1");
    expect(script).toContain("check-runs?per_page=1");
    expect(script).toContain("statuses?per_page=1");
    expect(script).toContain("pulls?state=open&per_page=1");
    expect(script).toContain("contents?ref=");
  });

  it("emits bounded evidence, outputs, summaries, and explicit limitations", () => {
    const script = readFileSync("scripts/maintainer-app-readiness.mjs", "utf8");

    expect(script).toContain("artifacts/operations/maintainer-app-readiness.json");
    expect(script).toContain("maintainer_app_readiness_status");
    expect(script).toContain("maintainer_app_readiness_report_path");
    expect(script).toContain("GITHUB_STEP_SUMMARY");
    expect(script).toContain("effective token");
    expect(script).toContain("underlying App installation");
    expect(script).not.toContain("NOEMA_MAINTAINER_APP_PRIVATE_KEY");
    expect(script).not.toContain("Authorization:");
    expect(script).not.toContain("console.log(process.env.GH_TOKEN");
  });

  it("documents the preflight artifacts, identity separation, and effective-token boundary", () => {
    const documentation = [
      readFileSync("docs/maintainer-app-readiness-audit.md", "utf8"),
      readFileSync("docs/hourly-commercial-readiness-loop.md", "utf8"),
      readFileSync("README.md", "utf8"),
    ].join("\n");

    expect(documentation).toContain("maintainer-app-readiness.yml");
    expect(documentation).toContain("npm run operations:preflight");
    expect(documentation).toContain("main-governance-audit");
    expect(documentation).toContain("maintainer-app-readiness");
    expect(documentation).toContain("commercial-readiness-loop-dry-run");
    expect(documentation).toContain("Maintainer");
    expect(documentation).toContain("reviewer");
    expect(documentation).toContain("effective token");
    expect(documentation).toContain("underlying App installation");
    expect(documentation).toContain("#29");
    expect(documentation).toContain("--apply");
  });
});
