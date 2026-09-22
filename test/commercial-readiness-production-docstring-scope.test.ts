import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const hourlyAuthorityFunctions = [
  "checkRunChronologicalOrder",
  "checkRunSuiteKey",
  "latestCheckRunsBySuite",
  "requiredWorkflowRunId",
  "requiredWorkflowMetadataIsCanonical",
  "workflowRunSource",
  "workflowRunMatchesTargetPullRequest",
  "workflowAuthorityByCheckSuite",
  "commercialCheckAppSlug",
  "observedRequiredWorkflows",
  "canonicalRequiredWorkflowObservation",
  "bindRequiredWorkflowMetadata",
  "parseNoemaReviewDecision",
  "fetchPullRequestSnapshot",
  "mergePullRequest",
  "main",
];

const evaluatorAuthorityFunctions = [
  "exactAuthorityString",
  "exactCheckName",
  "isTrustedGitHubActionsCheck",
  "validatePullRequestIdentity",
  "validateRequiredCheckProducers",
  "validateRequiredChecks",
  "validateObservedChecks",
];

const governanceAuthorityFunctions = [
  "exactAuthorityString",
  "positiveInteger",
  "ruleParameters",
  "addCheck",
  "rulesOfType",
  "observedWorkflowControls",
  "isCanonicalRequiredWorkflow",
  "emptyObservedControls",
  "evaluateMainGovernanceRules",
];

describe("commercial-readiness production-docstring contract scope", () => {
  it("covers every authority-bearing production function added or behaviorally changed by PR #730", () => {
    const contract = readFileSync("test/commercial-readiness-production-docstrings.test.ts", "utf8");

    for (const functionName of [
      ...hourlyAuthorityFunctions,
      ...evaluatorAuthorityFunctions,
      ...governanceAuthorityFunctions,
    ]) {
      expect(contract, `${functionName} missing from docstring contract`).toContain(`\"${functionName}\"`);
    }
  });
});
