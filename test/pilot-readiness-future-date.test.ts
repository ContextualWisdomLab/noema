import { describe, expect, it } from "vitest";
import { evaluatePilotReadinessText } from "../scripts/lib/pilot-readiness.mjs";

function completedPilotWithDates(handoverDate: string, onboardingDate: string) {
  return `# 파일럿 온보딩 진행 기록

## 항목 1
- 고객명: Acme Security
- NOEMA URL: https://noema.acme-security.com/exchange
- 지원 채널 합의: Slack acme-noema-ops
- 증빙 출처: production
- 계약/매출 증빙 경로: contracts/acme-paid-pilot.pdf
- 분석 데이터 경로: artifacts/saleable-readiness/noema-kpi-evidence.json
- exchange_failure_rate: 0
- exchange_p95_latency_ms: 157
- [x] 실패율 <= 0.02
- [x] p95 < 300
- [x] 운영 이관 승인
- 운영 전환 승인일: ${handoverDate}
- 온보딩 완료일: ${onboardingDate}
- trace_id 샘플: trace-2f4c9a77-1e8a-4f3b-9b9a-a8c1e6f0b5d1
`;
}

describe("pilot readiness completion chronology", () => {
  it("rejects future completion dates instead of granting saleable-readiness authority", () => {
    const result = evaluatePilotReadinessText(completedPilotWithDates("9999-12-30", "9999-12-31"));

    expect(result.passed).toBe(false);
    expect(result.entries[0].failures).toContain("운영 전환 승인일 must not be in the future");
    expect(result.entries[0].failures).toContain("온보딩 완료일 must not be in the future");
  });
});
