const dateOnlyRegex = /^\d{4}-\d{2}-\d{2}$/;

function hasValidDate(value) {
  return dateOnlyRegex.test(String(value ?? "").trim());
}

function metricValue(entry, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = entry.match(new RegExp(`^-\\s*\`?${escaped}\`?\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)\\s*$`, "m"));
  return match ? Number(match[1]) : null;
}

function fieldValue(entry, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = entry.match(new RegExp(`^-\\s*${escaped}:\\s*(.+)\\s*$`, "m"));
  return match ? match[1].trim() : "";
}

function hasCheckedLine(entry, labelPattern) {
  return new RegExp(`^-\\s*\\[x\\]\\s*${labelPattern}\\s*$`, "m").test(entry);
}

function isUsableProductionUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(value.replace(/`/g, ""));
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:"
      && host !== "localhost"
      && host !== "127.0.0.1"
      && !host.endsWith(".local")
      && !host.includes("example");
  } catch {
    return false;
  }
}

function isUsableSupportChannel(value) {
  const normalized = value.toLowerCase();
  return normalized.length > 0
    && !normalized.includes("@noema.local")
    && !normalized.includes("example")
    && !normalized.includes("localhost");
}

function evaluatePilotEntry(entry) {
  const customerName = fieldValue(entry, "고객명");
  const noemaUrl = fieldValue(entry, "NOEMA URL");
  const supportChannel = fieldValue(entry, "지원 채널 합의");
  const onboardingDate = fieldValue(entry, "온보딩 완료일");
  const handoverDate = fieldValue(entry, "운영 전환 승인일");
  const evidenceSourceKind = fieldValue(entry, "증빙 출처") || fieldValue(entry, "evidence_source_kind");
  const contractEvidencePath = fieldValue(entry, "계약/매출 증빙 경로");
  const evidencePath = fieldValue(entry, "분석 데이터 경로");
  const traceId = fieldValue(entry, "trace_id 샘플");
  const failureRate = metricValue(entry, "exchange_failure_rate");
  const p95 = metricValue(entry, "exchange_p95_latency_ms");

  const failures = [];
  if (!customerName) failures.push("고객명 required");
  if (!isUsableProductionUrl(noemaUrl)) failures.push("NOEMA URL must be a non-example HTTPS production URL");
  if (!isUsableSupportChannel(supportChannel)) failures.push("지원 채널 합의 must be a real non-local channel");
  if (!hasValidDate(onboardingDate)) failures.push("온보딩 완료일 required");
  if (!hasValidDate(handoverDate)) failures.push("운영 전환 승인일 required");
  if (!hasCheckedLine(entry, "운영 이관 승인")) failures.push("운영 이관 승인 required");
  if (!hasCheckedLine(entry, "(?:p95 <= 300|p95 < 300)")) failures.push("p95 threshold checkbox required");
  if (!hasCheckedLine(entry, "실패율 <= 0\\.02")) failures.push("failure-rate threshold checkbox required");
  if (failureRate === null || failureRate > 0.02) failures.push("exchange_failure_rate must be <= 0.02");
  if (p95 === null || p95 >= 300) failures.push("exchange_p95_latency_ms must be < 300");
  if (!evidencePath) failures.push("분석 데이터 경로 required");
  if (!traceId) failures.push("trace_id 샘플 required");
  if (evidenceSourceKind !== "production") failures.push("증빙 출처 must be production");
  if (!contractEvidencePath) failures.push("계약/매출 증빙 경로 required");

  return {
    customerName,
    passed: failures.length === 0,
    failures,
  };
}

export function evaluatePilotReadinessText(text) {
  const entries = text.split(/^## 항목\s+\d+/m).slice(1);
  const evaluatedEntries = entries.map(evaluatePilotEntry);
  return {
    passed: evaluatedEntries.some((entry) => entry.passed),
    entries: evaluatedEntries,
  };
}
