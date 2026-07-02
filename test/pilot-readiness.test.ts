import { describe, expect, it } from "vitest";
import { evaluatePilotReadinessText } from "../scripts/lib/pilot-readiness.mjs";

function pilotLog(overrides = "") {
  return `# 파일럿 온보딩 진행 기록

## 항목 1
- 고객명: Acme Security
- 시작일: 2026-06-15
- 담당자(공급자/고객): Noema / Acme 운영팀
- 환경: production
- NOEMA URL: https://noema.acme-security.com/exchange
- 계약/제안 단계:
- [x] 가격 합의
- [x] SLA/지원 범위 합의
- [x] 이용약관 확정
- 지원 채널 합의: Slack acme-noema-ops
- 증빙 출처: production
- 계약/매출 증빙 경로: contracts/acme-paid-pilot.pdf

## 기술 검증
- [x] /health 확인
- [x] /exchange 정상 토큰 교환 1건 이상
- [x] 실패 응답이 표준 에러 코드로만 발생
- [x] x-trace-id, x-latency-ms 헤더 확인
- [x] 장애 대응 알림 규칙 적용

## KPI 증빙
- 분석 데이터 경로: artifacts/saleable-readiness/20260702/noema-kpi-evidence.json
- exchange_failure_rate: 0
- exchange_p95_latency_ms: 157
- 30일 구간 충족 여부:
- [x] 실패율 <= 0.02
- [x] p95 < 300

## 완료 판단
- [x] 운영 이관 승인
- 운영 전환 승인일: 2026-06-30
- 온보딩 완료일: 2026-07-01

## 완료 증빙
- trace_id 샘플: trace-2f4c9a77-1e8a-4f3b-9b9a-a8c1e6f0b5d1
${overrides}`;
}

describe("pilot readiness parser", () => {
  it("passes a completed production pilot entry", () => {
    const result = evaluatePilotReadinessText(pilotLog());

    expect(result.passed).toBe(true);
    expect(result.entries[0].failures).toEqual([]);
  });

  it("rejects example URLs and local support evidence", () => {
    const text = pilotLog()
      .replace("https://noema.acme-security.com/exchange", "https://noema.example.workers.dev/exchange")
      .replace("Slack acme-noema-ops", "support@noema.local");

    const result = evaluatePilotReadinessText(text);

    expect(result.passed).toBe(false);
    expect(result.entries[0].failures).toContain("NOEMA URL must be a non-example HTTPS production URL");
    expect(result.entries[0].failures).toContain("지원 채널 합의 must be a real non-local channel");
  });

  it("rejects entries without production and contract evidence", () => {
    const text = pilotLog()
      .replace("- 증빙 출처: production\n", "")
      .replace("- 계약/매출 증빙 경로: contracts/acme-paid-pilot.pdf\n", "");

    const result = evaluatePilotReadinessText(text);

    expect(result.passed).toBe(false);
    expect(result.entries[0].failures).toContain("증빙 출처 must be production");
    expect(result.entries[0].failures).toContain("계약/매출 증빙 경로 required");
  });
});
