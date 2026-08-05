import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function workflowText(): string {
  return readFileSync(
    ".github/workflows/hourly-product-development.yml",
    "utf8",
  );
}

describe("hourly product-development publication prerequisites", () => {
  it("fails closed before OpenCode when the Maintainer App cannot publish a proposal", () => {
    const workflow = workflowText();
    const prerequisiteIndex = workflow.indexOf("maintainer_app_unavailable");
    const promptIndex = workflow.indexOf("Prepare bounded commercial-quality task");
    const checkoutIndex = workflow.indexOf(
      "Check out trusted default-branch source without persisted credentials",
    );
    const modelIndex = workflow.indexOf("Run bounded NVIDIA NIM model fallback");

    expect(workflow).toContain(
      "MAINTAINER_APP_CLIENT_ID_CONFIGURED: ${{ vars.NOEMA_MAINTAINER_APP_CLIENT_ID != '' }}",
    );
    expect(workflow).toContain(
      "MAINTAINER_APP_PRIVATE_KEY_CONFIGURED: ${{ secrets.NOEMA_MAINTAINER_APP_PRIVATE_KEY != '' }}",
    );
    expect(workflow).toContain(
      '[ "$MAINTAINER_APP_CLIENT_ID_CONFIGURED" != "true" ]',
    );
    expect(workflow).toContain(
      '[ "$MAINTAINER_APP_PRIVATE_KEY_CONFIGURED" != "true" ]',
    );
    expect(workflow).toContain("reason=maintainer_app_unavailable");
    expect(workflow).toContain(
      '&& [ "$DRY_RUN" != "true" ]; then',
    );
    expect(prerequisiteIndex).toBeGreaterThan(-1);
    expect(prerequisiteIndex).toBeLessThan(promptIndex);
    expect(prerequisiteIndex).toBeLessThan(checkoutIndex);
    expect(prerequisiteIndex).toBeLessThan(modelIndex);
  });

  it("documents the fail-closed publication-readiness boundary", () => {
    const operations = readFileSync(
      "docs/operations/hourly-product-development-prerequisites.md",
      "utf8",
    );
    const doctoring = readFileSync(
      "docs/doctoring/hourly-product-development-prerequisites.md",
      "utf8",
    );
    const changelog = readFileSync("CHANGELOG.md", "utf8");

    for (const requiredText of [
      "NOEMA_MAINTAINER_APP_CLIENT_ID",
      "NOEMA_MAINTAINER_APP_PRIVATE_KEY",
      "maintainer_app_unavailable",
      "OpenCode",
      "NVIDIA_NIM_API_KEY",
      "dry_run",
    ]) {
      expect(operations).toContain(requiredText);
    }
    expect(doctoring).toContain("NIST SP 800-218");
    expect(doctoring).toContain("APA 7");
    expect(doctoring).toContain("least privilege");
    expect(changelog).toContain("maintainer_app_unavailable");
  });
});
