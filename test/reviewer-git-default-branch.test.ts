import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const GIT_INIT_WORKFLOWS = [
  ["reviewer-ci", ".github/workflows/reviewer-ci.yml"],
  ["application-ci", ".github/workflows/ci.yml"],
  ["readiness-audit", ".github/workflows/readiness-scan.yml"],
  ["acquisition-readiness-audit", ".github/workflows/acquisition-readiness-scan.yml"],
  ["private-vulnerability-reporting-audit", ".github/workflows/private-vulnerability-reporting-audit.yml"],
  ["maintainer-app-readiness", ".github/workflows/maintainer-app-readiness.yml"],
  ["hourly-commercial-readiness", ".github/workflows/hourly-commercial-readiness.yml"],
  ["hourly-product-development", ".github/workflows/hourly-product-development.yml"],
  ["production-cd", ".github/workflows/cd.yml"],
  ["central-review", ".github/workflows/central-review.yml"],
  ["patch-validator-image", ".github/workflows/patch-validator-image.yml"],
  ["release-evidence", ".github/workflows/release-evidence.yml"],
] as const;

const assertSemanticMainInit = (workflow: string): void => {
  expect(workflow).toContain('GIT_CONFIG_COUNT: "1"');
  expect(workflow).toContain("GIT_CONFIG_KEY_0: init.defaultBranch");
  expect(workflow).toContain("GIT_CONFIG_VALUE_0: main");
  expect(workflow).not.toContain("advice.defaultBranchName");
};

describe("hosted Git initialization", () => {
  it.each(GIT_INIT_WORKFLOWS)(
    "%s makes every inherited git init use main without suppressing branch advice",
    (_name, workflowPath) => {
      assertSemanticMainInit(readFileSync(workflowPath, "utf8"));
    },
  );

  it("central-review configures every checkout-bearing job rather than only the workflow globally", () => {
    const workflow = readFileSync(".github/workflows/central-review.yml", "utf8");
    const collectEvidence = workflow.slice(
      workflow.indexOf("  collect_evidence:"),
      workflow.indexOf("  attest_evidence:"),
    );
    const publishReview = workflow.slice(workflow.indexOf("  publish_review:"));

    expect(collectEvidence.match(/actions\/checkout@/g)).toHaveLength(2);
    expect(publishReview.match(/actions\/checkout@/g)).toHaveLength(1);
    assertSemanticMainInit(collectEvidence);
    assertSemanticMainInit(publishReview);
  });

  it("release-evidence configures both checkout-bearing jobs independently", () => {
    const workflow = readFileSync(".github/workflows/release-evidence.yml", "utf8");
    const verifyRelease = workflow.slice(
      workflow.indexOf("  verify_release:"),
      workflow.indexOf("  materialize_release:"),
    );
    const materializeRelease = workflow.slice(
      workflow.indexOf("  materialize_release:"),
      workflow.indexOf("  attest_release:"),
    );

    expect(verifyRelease.match(/actions\/checkout@/g)).toHaveLength(1);
    expect(materializeRelease.match(/actions\/checkout@/g)).toHaveLength(1);
    assertSemanticMainInit(verifyRelease);
    assertSemanticMainInit(materializeRelease);
  });

  it("hourly product development binds all three checkout-bearing jobs to one inherited main-init contract", () => {
    const workflow = readFileSync(".github/workflows/hourly-product-development.yml", "utf8");

    expect(workflow.match(/actions\/checkout@/g)).toHaveLength(3);
    assertSemanticMainInit(workflow);
  });
});