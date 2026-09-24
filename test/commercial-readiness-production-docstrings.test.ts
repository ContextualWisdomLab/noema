import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function expectDirectJsDoc(source: string, functionName: string) {
  const declarationPattern = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${functionName}\\(`);
  const match = declarationPattern.exec(source);
  expect(match, `${functionName} declaration`).not.toBeNull();

  const declaration = match?.index ?? -1;
  const prefix = source.slice(0, declaration).trimEnd();
  expect(prefix.endsWith("*/"), `${functionName} must have a direct JSDoc block`).toBe(true);
  const jsDocStart = prefix.lastIndexOf("/**");
  expect(jsDocStart, `${functionName} JSDoc start`).toBeGreaterThanOrEqual(0);
  const contractTerms = prefix.slice(jsDocStart).match(/\b(authority|identity|exact|fail|reject|current|canonical|merge|evidence|workflow|check|status|chronology)\b/gi) ?? [];
  expect(
    new Set(contractTerms.map((term) => term.toLowerCase())).size,
    `${functionName} JSDoc must describe a substantive authority, evidence-order, or fail-closed contract`,
  ).toBeGreaterThanOrEqual(2);
}

describe("commercial-readiness touched production docstrings", () => {
  it("rejects a generic single-keyword JSDoc as insufficient contract evidence", () => {
    const weakSource = "/** current */\nfunction weakContract() {}\n";
    expect(() => expectDirectJsDoc(weakSource, "weakContract")).toThrow();
  });

  it("rejects a generic two-keyword JSDoc that does not state a contract", () => {
    const weakSource = "/** Returns the current status. */\nfunction weakContract() {}\n";
    expect(() => expectDirectJsDoc(weakSource, "weakContract")).toThrow();
  });

  it("documents every authority-bearing production function touched by PR #730", () => {
    const hourly = readFileSync("scripts/hourly-commercial-readiness.mjs", "utf8");
    for (const functionName of [
      "checkRunTimestamp",
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
      "latestReviewStates",
      "parseNoemaReviewDecision",
      "latestStatuses",
      "fetchPullRequestSnapshot",
      "assertLiveHead",
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
      "validateReviews",
      "validateRequiredCheckProducers",
      "validateRequiredChecks",
      "validateObservedChecks",
      "validateChecks",
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
