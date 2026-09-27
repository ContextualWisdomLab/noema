import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  REQUIRED_MAIN_CHECK_INTEGRATION_ID,
  REQUIRED_MAIN_CHECK_NAMES,
  REQUIRED_MAIN_WORKFLOW,
  evaluateMainGovernanceRules,
} from "../scripts/lib/main-governance-audit.mjs";

function governanceRules(allowedMergeMethods: string[]) {
  return [
    {
      type: "pull_request",
      ruleset_id: 101,
      ruleset_source_type: "Repository",
      ruleset_source: "ContextualWisdomLab/noema",
      parameters: {
        allowed_merge_methods: allowedMergeMethods,
        dismiss_stale_reviews_on_push: true,
        require_code_owner_review: false,
        require_last_push_approval: false,
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
        do_not_enforce_on_create: false,
        strict_required_status_checks_policy: true,
        required_status_checks: REQUIRED_MAIN_CHECK_NAMES.map((context) => ({
          context,
          integration_id: REQUIRED_MAIN_CHECK_INTEGRATION_ID,
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
    {
      type: "workflows",
      ruleset_id: 18_794_436,
      ruleset_source_type: REQUIRED_MAIN_WORKFLOW.ruleset_source_type,
      ruleset_source: REQUIRED_MAIN_WORKFLOW.ruleset_source,
      parameters: {
        workflows: [{
          repository_id: REQUIRED_MAIN_WORKFLOW.repository_id,
          path: REQUIRED_MAIN_WORKFLOW.path,
          ref: REQUIRED_MAIN_WORKFLOW.ref,
          sha: REQUIRED_MAIN_WORKFLOW.sha,
        }],
      },
    },
  ];
}

describe("normal-merge governance authority", () => {
  it("admits the normal merge method used by the CWL execution contract", () => {
    const result = evaluateMainGovernanceRules(governanceRules(["merge"]));

    expect(result.status).toBe("PASS");
    expect(result.failures.map((failure) => failure.code)).not.toContain("merge_commit_not_allowed");
  });

  it("does not let squash-only policy satisfy normal-merge authority", () => {
    const result = evaluateMainGovernanceRules(governanceRules(["squash"]));

    expect(result.status).toBe("FAIL");
    expect(result.failures).toContainEqual({
      code: "merge_commit_not_allowed",
      detail: "At least one active pull-request rule does not permit normal merge commits.",
    });
  });

  it("keeps active operational documentation on the normal-merge contract", () => {
    const operationalDocs = [
      "docs/main-governance-audit.md",
      "docs/hourly-commercial-readiness-loop.md",
      "docs/development/contributor-and-agent-procedure.md",
      "docs/UML.md",
    ].map((path) => [path, readFileSync(path, "utf8")] as const);

    for (const [path, source] of operationalDocs) {
      expect(source, `${path} must not advertise SHA-bound squash merge`).not.toContain(
        "SHA-bound squash merge",
      );
    }
    expect(operationalDocs[0][1]).toContain("allow normal merge commits (`merge`)");
    expect(operationalDocs[1][1]).toContain("SHA-bound normal merge commit");
    expect(operationalDocs[2][1]).toContain("SHA-bound normal\nmerge commit");
    expect(operationalDocs[3][1]).toContain("request SHA-bound normal merge");
    expect(operationalDocs[3][1]).toContain("## 5. Evidence and authority state machine");
    expect(operationalDocs[3][1]).toContain("## 9. Diagram maintenance rules");
  });
});
