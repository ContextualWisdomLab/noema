import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readText(path: string): string {
  return readFileSync(path, "utf8");
}

describe("workflow-registry live-disable operator documentation contract", () => {
  it("keeps the operator command, doctoring, and changelog aligned", () => {
    const packageJson = JSON.parse(readText("package.json"));
    const doctoring = readText("docs/doctoring/workflow-registry-disablement.md");
    const changelog = readText("CHANGELOG.md");

    expect(packageJson.scripts["operations:workflow-registry-disable"]).toBe(
      "node scripts/workflow-registry-live-disable.mjs",
    );

    for (const phrase of [
      "scripts/workflow-registry-live-disable.mjs",
      "npm run operations:workflow-registry-disable -- 101",
      "NOEMA_MAINTAINER_TOKEN_PATH",
      "ContextualWisdomLab/noema",
      "remaining_failure_codes",
      "remaining_active_orphan_ids",
      "post_audit_status",
      "disabled_manually",
      "disabled_registry_record",
      "COPILOT_GITHUB_TOKEN",
      "schema-v1",
    ]) {
      expect(doctoring).toContain(phrase);
    }

    expect(changelog).toContain("`operations:workflow-registry-disable`");
    expect(changelog).toContain("NOEMA_MAINTAINER_TOKEN_PATH");
    expect(changelog).toContain("remaining_active_orphan_ids");
    expect(changelog).toContain("post_audit_status: FAIL");
  });
});
