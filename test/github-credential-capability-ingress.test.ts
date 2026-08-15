import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readDelegatedGithubToken } from "../scripts/lib/delegated-github-token.mjs";

const temporaryDirectories: string[] = [];

function temporaryFile(contents: string) {
  const directory = mkdtempSync(join(tmpdir(), "noema-token-capability-"));
  temporaryDirectories.push(directory);
  const path = join(directory, "token");
  writeFileSync(path, contents, { encoding: "utf8", mode: 0o600 });
  return path;
}

function stepBlock(workflow: string, name: string) {
  const start = workflow.indexOf(name);
  const nextStep = workflow.indexOf("\n      - name:", start + 1);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(nextStep).toBeGreaterThan(start);
  return workflow.slice(start, nextStep);
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("GitHub credential capability ingress", () => {
  it("reads a non-empty control-free delegated token from the explicit capability path", () => {
    const path = temporaryFile("delegated-token-value");
    expect(readDelegatedGithubToken(path)).toBe("delegated-token-value");
  });

  it("fails closed for missing, unreadable, empty, and control-bearing capability files", () => {
    expect(() => readDelegatedGithubToken("")).toThrow("Maintainer token file path is required.");
    expect(() => readDelegatedGithubToken("/definitely/not/a/noema/token")).toThrow(
      "Maintainer token file could not be read:",
    );
    expect(() => readDelegatedGithubToken(temporaryFile(""))).toThrow(
      "Maintainer token file must not be empty.",
    );
    expect(() => readDelegatedGithubToken(temporaryFile("token\nvalue"))).toThrow(
      "Maintainer token must not contain control characters.",
    );
  });

  it("keeps delegated GitHub bearer tokens out of Node process-environment reads", () => {
    for (const scriptPath of [
      "scripts/main-governance-audit.mjs",
      "scripts/hourly-commercial-readiness.mjs",
    ]) {
      const script = readFileSync(scriptPath, "utf8");
      expect(script).toContain("NOEMA_MAINTAINER_TOKEN_PATH");
      expect(script).toContain("readDelegatedGithubToken");
      expect(script).not.toContain("process.env.GH_TOKEN");
    }
  });

  it("bootstraps governance and commercial-loop callers through restrictive ephemeral capability files", () => {
    const workflowCases = [
      {
        path: ".github/workflows/hourly-commercial-readiness.yml",
        steps: ["verify active main governance before any write", "inspect, dispatch, and merge exact-head pull requests"],
      },
      {
        path: ".github/workflows/maintainer-app-readiness.yml",
        steps: ["audit active main governance", "inspect commercial-readiness loop without writes"],
      },
    ];

    for (const workflowCase of workflowCases) {
      const workflow = readFileSync(workflowCase.path, "utf8");
      for (const stepName of workflowCase.steps) {
        const block = stepBlock(workflow, stepName);
        expect(block).toContain("DELEGATED_MAINTAINER_TOKEN: ${{ steps.maintainer_app.outputs.token }}");
        expect(block).toContain("NOEMA_MAINTAINER_TOKEN_PATH");
        expect(block).toContain("umask 077");
        expect(block).toContain("unset DELEGATED_MAINTAINER_TOKEN");
        expect(block).toContain("trap 'rm -f \"$token_path\"' EXIT");
        expect(block).not.toContain("GH_TOKEN: ${{ steps.maintainer_app.outputs.token }}");
      }
    }
  });
});
