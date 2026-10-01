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
    const modelIndex = workflow.indexOf("Run one contextual-orchestrator OpenCode session");

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
      "NOEMA_LLM_API_KEY",
      "contextual-orchestrator",
      "dry_run",
    ]) {
      expect(operations).toContain(requiredText);
    }
    expect(operations).toContain(
      "NOEMA_LLM_API_URL_ALLOWLIST_JSON`이 없으면 `orchestrator_gateway_unavailable`로 종료합니다.",
    );
    expect(operations).toContain(
      "선택 URL이 exact member가 아니면 gateway preflight 단계가 health 요청과 credential-bearing 설정 전에 실패합니다.",
    );
    expect(operations).not.toContain(
      "없거나 선택 URL이 exact member가 아니면 `orchestrator_gateway_unavailable`",
    );
    expect(operations).toContain(
      "`orchestrator_gateway_unavailable`이면 게이트웨이 URL, `NOEMA_LLM_API_URL_ALLOWLIST_JSON`, 전용 추론 토큰, `/healthz` 신원을 복구합니다.",
    );
    expect(doctoring).toContain("NIST SP 800-218");
    expect(doctoring).toContain("APA 7");
    expect(doctoring).toContain("least privilege");
    expect(changelog).toContain("maintainer_app_unavailable");
  });
});
