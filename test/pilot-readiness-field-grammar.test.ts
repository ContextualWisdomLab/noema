import { describe, expect, it } from "vitest";
import { evaluatePilotReadinessText } from "../scripts/lib/pilot-readiness.mjs";

function completedPilot() {
  return `# 파일럿 온보딩 진행 기록

## 항목 1
- 고객명: Acme Security
- NOEMA URL: https://noema.acme-security.com/exchange
- 지원 채널 합의: Slack acme-noema-ops
- 증빙 출처: production
- 계약/매출 증빙 경로: contracts/acme-paid-pilot.pdf
- 분석 데이터 경로: artifacts/saleable-readiness/20260702/noema-kpi-evidence.json
- exchange_failure_rate: 0
- exchange_p95_latency_ms: 157
- [x] 실패율 <= 0.02
+- [x] p95 < 300
+- [x] 운영 이관 승인
+- 운영 전환 승인일: 2026-06-30
+- 온보딩 완료일: 2026-07-01
+- trace_id 샘플: trace-2f4c9a77-1e8a-4f3b-9b9a-a8c1e6f0b5d1
+`;
+}
+
+describe("pilot readiness authority field grammar", () => {
+  it("does not widen plain authority labels to backtick-quoted labels", () => {
+    const result = evaluatePilotReadinessText(
+      completedPilot().replace("- 고객명: Acme Security", "- `고객명`: Acme Security"),
+    );
+
+    expect(result.passed).toBe(false);
+    expect(result.entries[0].failures).toContain("고객명 required");
+  });
+
+  it("does not widen plain field-value grammar to whitespace before the colon", () => {
+    const result = evaluatePilotReadinessText(
+      completedPilot().replace("- 고객명: Acme Security", "- 고객명   : Acme Security"),
+    );
+
+    expect(result.passed).toBe(false);
+    expect(result.entries[0].failures).toContain("고객명 required");
+  });
+
+  it("continues to accept the historically supported paired-backtick form for metric names", () => {
+    const result = evaluatePilotReadinessText(
+      completedPilot()
+        .replace("- exchange_failure_rate: 0", "- `exchange_failure_rate`: 0")
+        .replace("- exchange_p95_latency_ms: 157", "- `exchange_p95_latency_ms`: 157"),
+    );
+
+    expect(result.passed).toBe(true);
+    expect(result.entries[0].failures).toEqual([]);
+  });
+
+  it("preserves the historical independently optional metric backticks", () => {
+    const result = evaluatePilotReadinessText(
+      completedPilot()
+        .replace("- exchange_failure_rate: 0", "- `exchange_failure_rate: 0")
+        .replace("- exchange_p95_latency_ms: 157", "- exchange_p95_latency_ms`: 157"),
+    );
+
+    expect(result.passed).toBe(true);
+    expect(result.entries[0].failures).toEqual([]);
+  });
+});
