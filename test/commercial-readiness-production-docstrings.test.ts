import { readFileSync } from "node:fs";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

function functionDeclarationStart(source: string, functionName: string): number {
  const sourceFile = ts.createSourceFile(
    "commercial-readiness-production.mjs",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const declaration = sourceFile.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === functionName,
  );
  return declaration?.getStart(sourceFile) ?? -1;
}

function expectDirectJsDoc(source: string, functionName: string) {
  const declaration = functionDeclarationStart(source, functionName);
  expect(declaration, `${functionName} declaration`).toBeGreaterThanOrEqual(0);

  const prefix = source.slice(0, declaration);
  const directJsDoc = /(?:^|\n)[\t ]*(\/\*\*(?:(?!\*\/)[\s\S])*\*\/)[\t \r\n]*$/.exec(prefix);
  expect(directJsDoc, `${functionName} must have a direct JSDoc block`).not.toBeNull();
  const contract = directJsDoc?.[1] ?? "";
  expect(
    contract,
    `${functionName} JSDoc must state a contract action`,
  ).toMatch(/\b(preserve|reject|require|bind|accept|admit|retain|resolve|classify|revalidate|assemble|execute|record|select|match|order|evaluate|build|detect|extract|trust(?:s|ed|ing)?|fail(?:-closed)?)\b/i);
  expect(
    contract,
    `${functionName} JSDoc must name the authority or evidence boundary`,
  ).toMatch(/\b(authority|identity|evidence|chronology|workflow|check|status|review(?:er)?|head|base|producer|publisher|credential|rules?|audit|results?|parameters?|merge|retr(?:y|ies)|source|controls?|failures?|governance)\b/i);
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

  it("rejects a semantic JSDoc separated from the declaration by another block comment", () => {
    const weakSource = [
      "/** Reject invalid status authority. */",
      "/* unrelated separator */",
      "function weakContract() {}",
      "",
    ].join("\n");
    expect(() => expectDirectJsDoc(weakSource, "weakContract")).toThrow();
  });

  it("rejects JSDoc-like text embedded in a line comment", () => {
    const weakSource = "// /** Reject invalid status authority. */\nfunction weakContract() {}\n";
    expect(() => expectDirectJsDoc(weakSource, "weakContract")).toThrow();
  });

  it("rejects JSDoc-like text nested inside a regular block comment", () => {
    const weakSource = [
      "/*",
      "/** Reject invalid status authority. */",
      "function weakContract() {}",
      "",
    ].join("\n");
    expect(() => expectDirectJsDoc(weakSource, "weakContract")).toThrow();
  });

  it("rejects function-like text inside a template literal as a declaration", () => {
    const weakSource = [
      "const example = `",
      "/** Reject invalid status authority. */",
      "function weakContract() {}",
      "`;",
      "function weakContract() {}",
      "",
    ].join("\n");
    expect(() => expectDirectJsDoc(weakSource, "weakContract")).toThrow();
  });

  it("rejects a nested declaration lookalike before the top-level production declaration", () => {
    const weakSource = [
      "if (true) {",
      "  /** Reject invalid status authority. */",
      "  function weakContract() {}",
      "}",
      "function weakContract() {}",
      "",
    ].join("\n");
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