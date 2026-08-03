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

  it("uses shell-free complete pagination for the live main rules endpoint", () => {
    const script = readFileSync("scripts/main-governance-audit.mjs", "utf8");

    expect(script).toContain('spawnSync("gh"');
    expect(script).toContain("shell: false");
    expect(script).toContain('["api", "--paginate", "--slurp", endpoint]');
    expect(script).toContain("rules/branches/main?per_page=100");
    expect(script).toContain("evaluateMainGovernanceRules");
  });

  it("writes bounded evidence, outputs, and a workflow summary", () => {
    const script = readFileSync("scripts/main-governance-audit.mjs", "utf8");

    expect(script).toContain("artifacts/governance/main-governance-audit.json");
    expect(script).toContain("NOEMA_GOVERNANCE_AUDIT_PATH");
    expect(script).toContain("GITHUB_STEP_SUMMARY");
    expect(script).toContain("GITHUB_OUTPUT");
    expect(script).toContain("governance_status=");
    expect(script).toContain("governance_report_path=");
    expect(script).toContain("MAX_ERROR_CHARS");
    expect(script).not.toContain("GITHUB_TOKEN");
    expect(script).not.toContain("GH_TOKEN");
  });

  it("fails closed when the audit or collection does not pass", () => {
    const script = readFileSync("scripts/main-governance-audit.mjs", "utf8");

    expect(script).toContain('if (report.status !== "PASS")');
    expect(script).toContain("process.exitCode = 1");
    expect(script).toContain('status: "FAIL"');
    expect(script).toContain('code: "governance_collection_failed"');
  });
});
