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
});
