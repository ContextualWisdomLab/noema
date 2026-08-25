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
      "NOEMA_MAINTAINER_TOKEN_PATH",
      "attempts/{run_attempt}/jobs?per_page=100",
      "filter=all",
      "byte-canonical",
      "PENDING",
      "runner_assignment_stalled",
      "deployment protection rules",
      "jobs.<job_id>.needs",
      "GH_HOST=github.com",
      "NVIDIA_NIM_API_KEY",
      "ambient proxy",
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

    expect(doctoring).toContain("exact positive `run_attempt`");
    expect(doctoring).toContain("every retained workflow job must carry the same exact positive `run_attempt`");
    expect(doctoring).toContain("run-wide `filter=all` endpoint can include predecessor attempts");
    expect(doctoring).toContain("predecessor-attempt assignment must not suppress current-attempt stall classification");
    expect(doctoring).toContain("`started_at` is not runner-assignment authority");
    expect(doctoring).toContain("positive `runner_id` or a non-empty `runner_name`");
    expect(doctoring).not.toContain("job pages are fully paginated with `per_page=100` and `filter=all`");
    expect(doctoring).not.toContain("such as `started_at`, a positive `runner_id`");
    expect(doctoring).not.toContain("export GH_TOKEN=");
    expect(doctoring).toContain("owner-only delegated token capability file");
    expect(doctoring).toContain("Do not use `echo` or `printf '%s\\n'`");
    expect(doctoring).toContain("Use `printf '%s'` exactly as shown");
    expect(doctoring).toContain("workflow runs and workflow jobs");
    expect(doctoring).toContain("Permissions required for fine-grained personal access tokens");

    expect(changelog).toContain("`operations:runner-assignment` audit");
    expect(changelog).toContain("runner assignment");
    expect(changelog).toContain("required Check");
    expect(changelog).toContain("formal review");
    expect(changelog).toContain("NOEMA_MAINTAINER_TOKEN_PATH");
    expect(changelog).toContain("[REDACTED]");
    expect(changelog).toContain("`started_at`");
    expect(changelog).toContain("`runner_id`");
    expect(changelog).toContain("`runner_name`");
  });
});
