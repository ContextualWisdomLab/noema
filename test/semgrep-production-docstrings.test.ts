import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pilotSource = readFileSync("scripts/lib/pilot-readiness.mjs", "utf8");
const runtimeSource = readFileSync("src/runtime-readiness.ts", "utf8");

const productionFunctions = [
  [pilotSource, "dateStatus"],
  [pilotSource, "metricValue"],
  [pilotSource, "metricCount"],
  [pilotSource, "fieldValue"],
  [pilotSource, "fieldCount"],
  [pilotSource, "bulletFieldValues"],
  [pilotSource, "hasCheckedLine"],
  [pilotSource, "isLocalOnlyHostname"],
  [pilotSource, "isUsableProductionUrl"],
  [pilotSource, "isUsableSupportChannel"],
  [pilotSource, "isUsableEvidenceReference"],
  [pilotSource, "evaluatePilotEntry"],
  [pilotSource, "evaluatePilotReadinessText"],
  [runtimeSource, "isTrustedWorkflowRepository"],
  [runtimeSource, "workflowRefName"],
  [runtimeSource, "isExactWorkflowRef"],
  [runtimeSource, "immutableWorkflowCommit"],
  [runtimeSource, "isCanonicalPositiveSafeInteger"],
  [runtimeSource, "isDurableObjectNamespace"],
  [runtimeSource, "isImportablePrivateKey"],
  [runtimeSource, "cachedPrivateKeyImportability"],
  [runtimeSource, "evaluateRuntimeReadiness"],
] as const;

function immediateJsdoc(source: string, name: string): string | undefined {
  const marker = `function ${name}(`;
  const functionIndex = source.indexOf(marker);
  if (functionIndex < 0) return undefined;

  let prefix = source.slice(0, functionIndex).trimEnd();
  for (const modifier of ["async", "export"] as const) {
    if (prefix.endsWith(modifier)) {
      prefix = prefix.slice(0, -modifier.length).trimEnd();
    }
  }
  const commentEnd = prefix.lastIndexOf("*/");
  const commentStart = prefix.lastIndexOf("/**", commentEnd);
  if (commentStart < 0 || commentEnd < commentStart) return undefined;
  if (prefix.slice(commentEnd + 2).trim().length > 0) return undefined;
  return prefix.slice(commentStart, commentEnd + 2);
}

describe("Semgrep-touched production docstring contract", () => {
  for (const [source, name] of productionFunctions) {
    it(`documents ${name} at its production authority boundary`, () => {
      expect(
        immediateJsdoc(source, name),
        `${name} must have an immediate JSDoc contract`,
      ).toBeDefined();
    });
  }
});
