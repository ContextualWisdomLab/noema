import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createGhSubprocessEnvironment,
  flattenRulePages,
  redactSensitiveValue,
} from "../scripts/main-governance-audit.mjs";

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

  it("passes only the explicit read-only GitHub CLI contract to the audit subprocess", () => {
    const childEnvironment = createGhSubprocessEnvironment({
      PATH: "/usr/bin:/bin",
      GH_TOKEN: "read-only-github-token",
      GH_HOST: "evil.example",
      NO_COLOR: "0",
      GITHUB_TOKEN: "must-not-cross",
      NVIDIA_NIM_API_KEY: "must-not-cross",
      NOEMA_MAINTAINER_APP_PRIVATE_KEY: "must-not-cross",
      NOEMA_REVIEWER_APP_PRIVATE_KEY: "must-not-cross",
      CLOUDFLARE_API_TOKEN: "must-not-cross",
      HOME: "/tmp/ambient-home",
      NODE_OPTIONS: "--require /tmp/preload.cjs",
      HTTPS_PROXY: "https://proxy.invalid",
    });

    expect(childEnvironment).toEqual({
      PATH: "/usr/bin:/bin",
      GH_TOKEN: "read-only-github-token",
      GH_HOST: "github.com",
      NO_COLOR: "1",
    });
  });

  it("redacts the delegated GitHub token before child diagnostics can be retained", () => {
    const token = "read-only-github-token";
    const diagnostic = `gh failed with ${token}; retry also exposed ${token}`;

    expect(redactSensitiveValue(diagnostic, [token])).toBe(
      "gh failed with [REDACTED]; retry also exposed [REDACTED]",
    );
    expect(redactSensitiveValue(diagnostic, ["", null, undefined, token])).not.toContain(token);
    expect(redactSensitiveValue("safe diagnostic", [])).toBe("safe diagnostic");
  });

  it("uses version-pinned bounded shell-free pagination for the live main rules endpoint", () => {
    const script = readFileSync("scripts/main-governance-audit.mjs", "utf8");

    expect(script).toContain('spawnSync("gh", ["api", ...githubApiHeaders, ...args]');
    expect(script).toContain("shell: false");
    expect(script).toContain("env: childEnvironment");
    expect(script).not.toContain("env: process.env");
    expect(script).toContain("MAX_GH_OUTPUT_BYTES");
    expect(script).toContain("MAX_GH_REQUEST_MILLISECONDS");
    expect(script).toContain("timeout: MAX_GH_REQUEST_MILLISECONDS");
    expect(script).toContain('Accept: application/vnd.github+json');
    expect(script).toContain('X-GitHub-Api-Version: 2022-11-28');
    expect(script).toContain('GH_HOST: "github.com"');
    expect(script).toContain("createGhSubprocessEnvironment");
    expect(script).toContain('["--paginate", "--slurp", endpoint]');
    expect(script).toContain("rules/branches/main?per_page=100");
    expect(script).toContain("evaluateMainGovernanceRules");
    expect(script).toContain("NOEMA_MAINTAINER_TOKEN_PATH");
    expect(script).not.toContain("process.env.GH_TOKEN");
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
    expect(script).toContain(
      "redactSensitiveValue(completed.error.message, [childEnvironment.GH_TOKEN])",
    );
    expect(script).toContain("redactSensitiveValue(rawDetail, [childEnvironment.GH_TOKEN])");
    expect(script).not.toContain("console.log(process.env.GH_TOKEN");
    expect(script).not.toContain("JSON.stringify(process.env");
  });

  it("propagates observed required-workflow evidence into the durable report and summary", () => {
    const script = readFileSync("scripts/main-governance-audit.mjs", "utf8");

    expect(script).toContain("observed_controls: evaluation.observed_controls");
    expect(script).toContain("Observed required workflows");
    expect(script).toContain("report.observed_controls.required_workflows.length");
    expect(script).toContain("pull_request_rule_present: false");
    expect(script).toContain("required_status_checks_rule_present: false");
    expect(script).toContain("non_fast_forward_rule_present: false");
    expect(script).toContain("deletion_rule_present: false");
    expect(script).toContain("required_workflows: []");
  });

  it("fails closed when the capability, audit, or collection do not pass", () => {
    const script = readFileSync("scripts/main-governance-audit.mjs", "utf8");

    expect(script).toContain("readDelegatedGithubToken(tokenPath)");
    expect(script).toContain('if (report.status !== "PASS")');
    expect(script).toContain("process.exitCode = 1");
    expect(script).toContain('status: "FAIL"');
    expect(script).toContain('code: "governance_collection_failed"');
  });
});
