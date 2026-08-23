import { describe, expect, it } from "vitest";
import { evaluatePilotReadinessText } from "../scripts/lib/pilot-readiness.mjs";

function completedPilot(contractEvidencePath: string, evidencePath: string, traceId = "trace-2f4c9a77-1e8a-4f3b-9b9a-a8c1e6f0b5d1") {
  return `# 파일럿 온보딩 진행 기록

## 항목 1
- 고객명: Acme Security
- NOEMA URL: https://noema.acme-security.com/exchange
- 지원 채널 합의: Slack acme-noema-ops
- 증빙 출처: production
- 계약/매출 증빙 경로: ${contractEvidencePath}
- 분석 데이터 경로: ${evidencePath}
- exchange_failure_rate: 0
- exchange_p95_latency_ms: 157
- [x] 실패율 <= 0.02
- [x] p95 < 300
- [x] 운영 이관 승인
- 운영 전환 승인일: 2026-06-30
- 온보딩 완료일: 2026-07-01
- trace_id 샘플: ${traceId}
`;
}

describe("pilot readiness evidence references", () => {
  it.each([
    ["example/contracts/demo-paid-pilot.pdf", "artifacts/example/noema-kpi-evidence.json"],
    ["localhost/contracts/demo-paid-pilot.pdf", "artifacts/localhost/noema-kpi-evidence.json"],
    ["fixtures.local/contracts/demo-paid-pilot.pdf", "artifacts/fixtures.local/noema-kpi-evidence.json"],
  ])("rejects documented sample markers in commercial evidence references", (contractEvidencePath, evidencePath) => {
    const result = evaluatePilotReadinessText(completedPilot(contractEvidencePath, evidencePath));

    expect(result.passed).toBe(false);
    expect(result.entries[0].failures).toContain("계약/매출 증빙 경로 must be a non-example evidence reference");
    expect(result.entries[0].failures).toContain("분석 데이터 경로 must be a non-example evidence reference");
  });

  it("rejects an example trace key as completion evidence", () => {
    const result = evaluatePilotReadinessText(completedPilot(
      "contracts/acme-paid-pilot.pdf",
      "artifacts/saleable-readiness/noema-kpi-evidence.json",
      "example-trace-id",
    ));

    expect(result.passed).toBe(false);
    expect(result.entries[0].failures).toContain("trace_id 샘플 must be a non-example evidence reference");
  });

  it.each([
    "https://127.0.0.2/exchange",
    "https://[::1]/exchange",
    "https://[::ffff:127.0.0.2]/exchange",
    "https://tenant.localhost/exchange",
    "https://0.0.0.0/exchange",
    "https://[::]/exchange",
  ])("rejects local-only or non-routable listener identities as production URLs (%s)", (url) => {
    const text = completedPilot(
      "contracts/acme-paid-pilot.pdf",
      "artifacts/saleable-readiness/noema-kpi-evidence.json",
    ).replace(
      "- NOEMA URL: https://noema.acme-security.com/exchange",
      `- NOEMA URL: ${url}`,
    );

    const result = evaluatePilotReadinessText(text);

    expect(result.passed).toBe(false);
    expect(result.entries[0].failures).toContain("NOEMA URL must be a non-example HTTPS production URL");
  });

  it.each([
    "https://localhost./exchange",
    "https://fixtures.local./exchange",
  ])("rejects absolute local DNS names as production URLs (%s)", (url) => {
    const text = completedPilot(
      "contracts/acme-paid-pilot.pdf",
      "artifacts/saleable-readiness/noema-kpi-evidence.json",
    ).replace(
      "- NOEMA URL: https://noema.acme-security.com/exchange",
      `- NOEMA URL: ${url}`,
    );

    const result = evaluatePilotReadinessText(text);

    expect(result.passed).toBe(false);
    expect(result.entries[0].failures).toContain("NOEMA URL must be a non-example HTTPS production URL");
  });

  it("rejects a .local support channel as sample evidence", () => {
    const text = completedPilot(
      "contracts/acme-paid-pilot.pdf",
      "artifacts/saleable-readiness/noema-kpi-evidence.json",
    ).replace(
      "- 지원 채널 합의: Slack acme-noema-ops",
      "- 지원 채널 합의: support@acme.local",
    );

    const result = evaluatePilotReadinessText(text);

    expect(result.passed).toBe(false);
    expect(result.entries[0].failures).toContain("지원 채널 합의 must be a real non-local channel");
  });

  it("rejects duplicate authoritative evidence instead of trusting the first matching line", () => {
    const text = completedPilot(
      "contracts/acme-paid-pilot.pdf",
      "artifacts/saleable-readiness/noema-kpi-evidence.json",
    )
      .replace(
        "- 증빙 출처: production",
        "- 증빙 출처: production\n- evidence_source_kind: fixture",
      )
      .replace(
        "- 계약/매출 증빙 경로: contracts/acme-paid-pilot.pdf",
        "- 계약/매출 증빙 경로: contracts/acme-paid-pilot.pdf\n- 계약/매출 증빙 경로: example/contracts/forged.pdf",
      )
      .replace(
        "- exchange_failure_rate: 0",
        "- exchange_failure_rate: 0\n- exchange_failure_rate: 0.9",
      );

    const result = evaluatePilotReadinessText(text);

    expect(result.passed).toBe(false);
    expect(result.entries[0].failures).toContain("증빙 출처 must appear exactly once");
    expect(result.entries[0].failures).toContain("계약/매출 증빙 경로 must appear exactly once");
    expect(result.entries[0].failures).toContain("exchange_failure_rate must appear exactly once");
  });

  it("rejects malformed or blank duplicate authority instead of ignoring the second label", () => {
    const text = completedPilot(
      "contracts/acme-paid-pilot.pdf",
      "artifacts/saleable-readiness/noema-kpi-evidence.json",
    )
      .replace(
        "- 계약/매출 증빙 경로: contracts/acme-paid-pilot.pdf",
        "- 계약/매출 증빙 경로: contracts/acme-paid-pilot.pdf\n- 계약/매출 증빙 경로:",
      )
      .replace(
        "- exchange_failure_rate: 0",
        "- exchange_failure_rate: 0\n- exchange_failure_rate: forged",
      );

    const result = evaluatePilotReadinessText(text);

    expect(result.passed).toBe(false);
    expect(result.entries[0].failures).toContain("계약/매출 증빙 경로 must appear exactly once");
    expect(result.entries[0].failures).toContain("exchange_failure_rate must appear exactly once");
  });
});
