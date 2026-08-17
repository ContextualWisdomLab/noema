import { describe, expect, it } from "vitest";
import { evaluateMainGovernanceRules } from "../scripts/lib/main-governance-audit.mjs";

describe("observed main governance controls", () => {
  it("records an enforced workflow without promoting missing target governance to PASS", () => {
    const result = evaluateMainGovernanceRules([
      {
        type: "workflows",
        ruleset_id: 18_794_436,
        ruleset_source_type: "Organization",
        ruleset_source: "ContextualWisdomLab",
        parameters: {
          do_not_enforce_on_create: false,
          workflows: [
            {
              repository_id: 1_274_066_402,
              path: ".github/workflows/security-scan.yml",
              ref: "refs/heads/main",
            },
          ],
        },
      },
    ]);

    expect(result.status).toBe("FAIL");
    expect(result.observed_controls).toEqual({
      required_workflows: [
        {
          repository_id: 1_274_066_402,
          path: ".github/workflows/security-scan.yml",
          ref: "refs/heads/main",
          ruleset_id: 18_794_436,
          ruleset_source_type: "Organization",
          ruleset_source: "ContextualWisdomLab",
        },
      ],
    });
    expect(result.failures.map((failure) => failure.code)).toContain("pull_request_rule_missing");
  });

  it("normalizes malformed workflow entries into bounded unknown evidence instead of inventing authority", () => {
    const result = evaluateMainGovernanceRules([
      {
        type: "workflows",
        ruleset_id: 18_794_436,
        ruleset_source_type: "Organization",
        ruleset_source: "ContextualWisdomLab",
        parameters: { workflows: [null, { repository_id: -1, path: "", ref: null }] },
      },
    ]);

    expect(result.observed_controls.required_workflows).toEqual([
      {
        repository_id: null,
        path: "unknown",
        ref: "unknown",
        ruleset_id: 18_794_436,
        ruleset_source_type: "Organization",
        ruleset_source: "ContextualWisdomLab",
      },
      {
        repository_id: null,
        path: "unknown",
        ref: "unknown",
        ruleset_id: 18_794_436,
        ruleset_source_type: "Organization",
        ruleset_source: "ContextualWisdomLab",
      },
    ]);
    expect(result.status).toBe("FAIL");
  });

  it("rejects object and array workflow identity fields instead of stringifying them", () => {
    const result = evaluateMainGovernanceRules([
      {
        type: "workflows",
        ruleset_id: -1,
        ruleset_source_type: { kind: "Organization" },
        ruleset_source: ["ContextualWisdomLab"],
        parameters: {
          workflows: [
            {
              repository_id: -1,
              path: { fake: ".github/workflows/security-scan.yml" },
              ref: ["refs/heads/main"],
            },
          ],
        },
      },
    ]);

    expect(result.observed_controls.required_workflows).toEqual([
      {
        repository_id: null,
        path: "unknown",
        ref: "unknown",
        ruleset_id: null,
        ruleset_source_type: "unknown",
        ruleset_source: "unknown",
      },
    ]);
    expect(result.status).toBe("FAIL");
  });
});
