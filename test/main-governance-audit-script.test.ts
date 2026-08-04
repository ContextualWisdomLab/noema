import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { flattenRulePages } from "../scripts/main-governance-audit.mjs";

describe("main governance audit GitHub adapter", () => {
  it("flattens every active-rules response page", () => {
    expect(flattenRulePages([
      [{ type: "pull_request", ruleset_id: 1 }],
      [{ type: "non_fast_forward", ruleset_id: 2 }],
      [],
    ])).toEqual([
      { type: "pull_request", ruleset_id: 1 },
      { type: "non_fast_forward", ruleset_id: 2 },
    ]);
  });

  it("rejects malformed paginated responses", () => {
    expect(() => flattenRulePages({ pages: [] })).toThrow(
      "Paginated active-rules response must be an array of pages.",
    );
    expect(() => flattenRulePages([[{ type: "pull_request" }], null])).toThrow(
      "Each active-rules page must be an array.",
    );
  });

  it("uses version-pinned bounded shell-free pagination for the live main rules endpoint", () => {
    const script = readFileSync("scripts/main-governance-audit.mjs", "utf8");

    expect(script).toContain('spawnSync("gh", ["api", ...githubApiHeaders, ...args]');
    expect(script).toContain("shell: false");
    expect(script).toContain("MAX_GH_OUTPUT_BYTES");
    expect(script).toContain("MAX_GH_REQUEST_MILLISECONDS");
    expect(script).toContain("timeout: MAX_GH_REQUEST_MILLISECONDS");
    expect(script).toContain('Accept: application/vnd.github+json');
    expect(script).toContain('X-GitHub-Api-Version: 2022-11-28');
    expect(script).toContain('GH_HOST: "github.com"');
    expect(script).toContain("GH_TOKEN: process.env.GH_TOKEN");
    expect(script).toContain('["--paginate", "--slurp", endpoint]');
    expect(script).toContain("rules/branches/main?per_page=100");
    expect(script).toContain("evaluateMainGovernanceRules");
  });

  it("writes single-line bounded evidence, outputs, and a workflow summary without leaking the token", () => {
    const script = readFileSync("scripts/main-governance-audit.mjs", "utf8");

    expect(script).toContain("artifacts/governance/main-governance-audit.json");
    expect(script).toContain("NOEMA_GOVERNANCE_AUDIT_PATH");
    expect(script).toContain("GITHUB_STEP_SUMMARY");
    expect(script).toContain("GITHUB_OUTPUT");
    expect(script).toContain('appendOutput("governance_status", report.status)');
    expect(script).toContain('appendOutput("governance_report_path", absoluteReportPath)');
    expect(script).toContain("MAX_ERROR_CHARS");
    expect(script).toContain('.replace(/[\\u0000-\\u001f\\u007f]/g, "")');
    expect(script).not.toContain("console.log(process.env.GH_TOKEN");
    expect(script).not.toContain("JSON.stringify(process.env");
  });

  it("fails closed when credentials, the audit, or collection do not pass", () => {
    const script = readFileSync("scripts/main-governance-audit.mjs", "utf8");

    expect(script).toContain("GH_TOKEN is required for the governance audit.");
    expect(script).toContain('if (report.status !== "PASS")');
    expect(script).toContain("process.exitCode = 1");
    expect(script).toContain('status: "FAIL"');
    expect(script).toContain('code: "governance_collection_failed"');
  });
});
