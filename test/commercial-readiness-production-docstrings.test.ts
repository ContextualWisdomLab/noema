import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function expectDirectJsDoc(source: string, functionName: string) {
  const marker = `function ${functionName}(`;
  const declaration = source.indexOf(marker);
  expect(declaration, `${functionName} declaration`).toBeGreaterThanOrEqual(0);

  const prefix = source.slice(0, declaration).trimEnd();
  expect(prefix.endsWith("*/"), `${functionName} must have a direct JSDoc block`).toBe(true);
  const jsDocStart = prefix.lastIndexOf("/**");
  expect(jsDocStart, `${functionName} JSDoc start`).toBeGreaterThanOrEqual(0);
  expect(prefix.slice(jsDocStart), `${functionName} JSDoc must describe a contract`).toMatch(/\b(authority|identity|exact|fail|current|canonical|merge|evidence|workflow|check)\b/i);
}

describe("commercial-readiness touched production docstrings", () => {
  it("documents every authority-bearing production function touched by PR #730", () => {
    const hourly = readFileSync("scripts/hourly-commercial-readiness.mjs", "utf8");
    for (const functionName of [
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
    ]) {
      expectDirectJsDoc(hourly, functionName);
    }

    const evaluator = readFileSync("scripts/lib/commercial-readiness-loop.mjs", "utf8");
    for (const functionName of [
      "exactAuthorityString",
      "exactCheckName",
      "isTrustedGitHubActionsCheck",
      "validatePullRequestIdentity",
      "validateRequiredCheckProducers",
      "validateRequiredChecks",
      "validateObservedChecks",
    ]) {
      expectDirectJsDoc(evaluator, functionName);
    }

    const governance = readFileSync("scripts/lib/main-governance-audit.mjs", "utf8");
    for (const functionName of [
      "exactAuthorityString",
      "positiveInteger",
      "ruleParameters",
      "addCheck",
      "rulesOfType",
      "observedWorkflowControls",
      "isCanonicalRequiredWorkflow",
      "emptyObservedControls",
      "evaluateMainGovernanceRules",
    ]) {
      expectDirectJsDoc(governance, functionName);
    }
  });
});
