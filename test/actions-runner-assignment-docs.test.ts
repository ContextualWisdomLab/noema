import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readText(path: string): string {
  return readFileSync(path, "utf8");
}

describe("runner-assignment operator documentation contract", () => {
  it("keeps the operator command, doctoring, and changelog aligned", () => {
    const packageJson = JSON.parse(readText("package.json"));
    const doctoring = readText("docs/doctoring/actions-runner-assignment-audit.md");
    const changelog = readText("CHANGELOG.md");

    expect(packageJson.scripts["operations:runner-assignment"]).toBe(
      "node scripts/actions-runner-assignment-audit.mjs",
    );

    for (const phrase of [
      "GitHub Actions Runner-Assignment Audit Doctoring",
      "ContextualWisdomLab/noema",
      "NOEMA_ACTIONS_AUDIT_HEAD_SHA",
      "NOEMA_ACTIONS_AUDIT_RUN_IDS",
      "filter=all",
      "PENDING",
      "runner_assignment_stalled",
      "deployment protection rules",
      "jobs.<job_id>.needs",
      "merge",
      "release",
      "deployment",
      "REST API endpoints for workflow runs",
      "REST API endpoints for workflow jobs",
      "Deployments and environments",
      "Workflow syntax for GitHub Actions",
    ]) {
      expect(doctoring).toContain(phrase);
    }

    expect(changelog).toContain("`operations:runner-assignment` audit");
    expect(changelog).toContain("runner assignment");
    expect(changelog).toContain("required Check");
    expect(changelog).toContain("formal review");
  });
});
