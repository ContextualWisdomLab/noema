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
] as const;

describe("hosted Git initialization", () => {
  it.each(GIT_INIT_WORKFLOWS)(
    "%s makes every inherited git init use main without suppressing branch advice",
    (_name, workflowPath) => {
      const workflow = readFileSync(workflowPath, "utf8");

      expect(workflow).toContain('GIT_CONFIG_COUNT: "1"');
      expect(workflow).toContain("GIT_CONFIG_KEY_0: init.defaultBranch");
      expect(workflow).toContain("GIT_CONFIG_VALUE_0: main");
      expect(workflow).not.toContain("advice.defaultBranchName");
    },
  );
});
