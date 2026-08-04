import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  bound,
  flattenInstallationRepositoryPages,
  normalizeBotAccount,
  normalizeRepositoryPermissions,
  parseConfiguredIdentity,
} from "../scripts/maintainer-app-readiness.mjs";

describe("maintainer App readiness collector", () => {
  it("flattens every object-shaped installation repository page", () => {
    expect(flattenInstallationRepositoryPages([
      {
        total_count: 2,
        repositories: [{ full_name: "ContextualWisdomLab/noema" }],
      },
      {
        total_count: 2,
        repositories: [{ full_name: "ContextualWisdomLab/other" }],
      },
      { total_count: 2, repositories: [] },
    ])).toEqual([
      { full_name: "ContextualWisdomLab/noema" },
      { full_name: "ContextualWisdomLab/other" },
    ]);
  });

  it("rejects malformed pagination envelopes instead of assuming completeness", () => {
    expect(() => flattenInstallationRepositoryPages({})).toThrow(/array of pages/);
    expect(() => flattenInstallationRepositoryPages([[]])).toThrow(/page must be an object/);
    expect(() => flattenInstallationRepositoryPages([{}])).toThrow(/repositories array/);
  });

  it("retains only documented single-line bounded bot identity fields", () => {
    expect(normalizeBotAccount({
      login: "noema-maintainer[bot]",
      type: "Bot",
      suspended: true,
      suspended_at: "2026-08-04T00:00:00Z",
      email: "must-not-be-retained@example.com",
    })).toEqual({
      login: "noema-maintainer[bot]",
      type: "Bot",
    });
    expect(normalizeBotAccount(null)).toEqual({ login: "", type: "" });
    expect(bound("a\u0000b", 1)).toBe("a…");
    expect(bound("line-one\n::error::forged\r\nline-two")).toBe(
      "line-one::error::forgedline-two",
    );
  });

  it("accepts only present, single-line, bounded identity configuration", () => {
    expect(parseConfiguredIdentity(" noema-reviewer[bot] ", "reviewer login")).toBe(
      "noema-reviewer[bot]",
    );
    expect(() => parseConfiguredIdentity("", "reviewer login")).toThrow(
      "reviewer login is required.",
    );
    expect(() => parseConfiguredIdentity("noema\nreviewer", "reviewer login")).toThrow(
      "reviewer login must not contain control characters.",
    );
    expect(() => parseConfiguredIdentity("x".repeat(201), "reviewer login")).toThrow(
      "reviewer login must be at most 200 characters.",
    );
  });

  it("preserves unknown administrator state instead of coercing it to false", () => {
    expect(normalizeRepositoryPermissions({
      pull: true,
      push: true,
      admin: false,
      maintain: true,
      triage: false,
    })).toEqual({
      pull: true,
      push: true,
      admin: false,
      maintain: true,
      triage: false,
    });
    expect(normalizeRepositoryPermissions({ pull: true, push: true })).toEqual({
      pull: true,
      push: true,
      admin: null,
      maintain: false,
      triage: false,
    });
    expect(normalizeRepositoryPermissions(null)).toEqual({
      pull: false,
      push: false,
      admin: null,
      maintain: false,
      triage: false,
    });
  });

  it("uses bounded shell-free GitHub API collection with full pagination", () => {
    const script = readFileSync("scripts/maintainer-app-readiness.mjs", "utf8");

    expect(script).toContain('spawnSync("gh"');
    expect(script).toContain("shell: false");
    expect(script).toContain("MAX_GH_OUTPUT_BYTES");
    expect(script).toContain("MAX_GH_REQUEST_MILLISECONDS");
    expect(script).toContain("timeout: MAX_GH_REQUEST_MILLISECONDS");
    expect(script).toContain('GH_HOST: "github.com"');
    expect(script).not.toContain("GH_HOST: process.env.GH_HOST");
    expect(script).toContain('"--paginate", "--slurp"');
    expect(script).toContain("installation/repositories?per_page=100");
    expect(script).toContain("flattenInstallationRepositoryPages");
    expect(script).toContain("actions/runs?per_page=1");
    expect(script).toContain("check-runs?per_page=1");
    expect(script).toContain("statuses?per_page=1");
    expect(script).toContain("pulls?state=open&per_page=1");
    expect(script).toContain("contents?ref=");
    expect(script).toContain("GH_TOKEN: process.env.GH_TOKEN");
    expect(script).not.toContain("NOEMA_MAINTAINER_APP_PRIVATE_KEY");
    expect(script).not.toContain("NOEMA_GITHUB_APP_PRIVATE_KEY");
    expect(script).not.toContain("console.log(process.env.GH_TOKEN");
  });

  it("binds authenticated reviewer App outputs into evaluation and evidence", () => {
    const script = readFileSync("scripts/maintainer-app-readiness.mjs", "utf8");

    expect(script).toContain("NOEMA_REVIEWER_APP_SLUG");
    expect(script).toContain("NOEMA_REVIEWER_INSTALLATION_ID");
    expect(script).toContain("reviewerAppSlug,");
    expect(script).toContain("reviewerInstallationId,");
    expect(script).toContain("reviewer_app_slug: evidence.reviewerAppSlug");
    expect(script).toContain("reviewer_installation_id: evidence.reviewerInstallationId");
    expect(script).toContain("Reviewer App:");
    expect(script).toContain("Reviewer installation id:");
  });

  it("binds the disabled activation state into evaluation and retained evidence", () => {
    const script = readFileSync("scripts/maintainer-app-readiness.mjs", "utf8");

    expect(script).toContain("const maintenanceEnabled =");
    expect(script).toContain("maintenanceEnabled,");
    expect(script).toContain("maintenance_enabled: evidence.maintenanceEnabled");
    expect(script).toContain("Maintenance enabled:");
  });

  it("registers the collector as the operations preflight command", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

    expect(packageJson.scripts["operations:preflight"]).toBe(
      "node scripts/maintainer-app-readiness.mjs",
    );
  });
});
