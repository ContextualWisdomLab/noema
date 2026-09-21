import { describe, expect, it } from "vitest";
import {
  REQUIRED_MAIN_CHECK_NAMES,
  evaluateMainGovernanceRules,
} from "../scripts/lib/main-governance-audit.mjs";

function otherwiseCompliantRules() {
  return [
    {
      type: "pull_request",
      ruleset_id: 101,
      ruleset_source_type: "Repository",
      ruleset_source: "ContextualWisdomLab/noema",
      parameters: {
        allowed_merge_methods: ["squash"],
        dismiss_stale_reviews_on_push: true,
        required_approving_review_count: 1,
        required_review_thread_resolution: true,
      },
    },
    {
      type: "required_status_checks",
      ruleset_id: 101,
      ruleset_source_type: "Repository",
      ruleset_source: "ContextualWisdomLab/noema",
      parameters: {
        strict_required_status_checks_policy: true,
        required_status_checks: REQUIRED_MAIN_CHECK_NAMES.map((context, index) => ({
          context,
          integration_id: 15_368 + index,
        })),
      },
    },
    {
      type: "non_fast_forward",
      ruleset_id: 101,
      ruleset_source_type: "Repository",
      ruleset_source: "ContextualWisdomLab/noema",
    },
    {
      type: "deletion",
      ruleset_id: 101,
      ruleset_source_type: "Repository",
      ruleset_source: "ContextualWisdomLab/noema",
    },
  ];
}

describe("main governance required workflow", () => {
  it("rejects otherwise compliant governance when the canonical central Security Scan workflow is absent", () => {
    const result = evaluateMainGovernanceRules(otherwiseCompliantRules());

    expect(result.status).toBe("FAIL");
    expect(result.failures).toContainEqual({
      code: "required_security_workflow_missing",
      detail: "The canonical organization-owned central Security Scan workflow is not enforced for main.",
    });
  });
});
