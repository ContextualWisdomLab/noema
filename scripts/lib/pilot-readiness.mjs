const dateOnlyRegex = /^\d{4}-\d{2}-\d{2}$/;

function dateStatus(value) {
  const normalized = String(value ?? "").trim();
  if (!dateOnlyRegex.test(normalized)) return "invalid";
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    return "invalid";
  }
  return parsed.getTime() > Date.now() ? "future" : "valid";
}

function metricValue(entry, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = entry.match(new RegExp(`^-\\s*\`?${escaped}\`?\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)\\s*$`, "m"));
  return match ? Number(match[1]) : null;
}

function metricCount(entry, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...entry.matchAll(new RegExp(`^-\\s*\`?${escaped}\`?\\s*:`, "gm"))].length;
}

function fieldValue(entry, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = entry.match(new RegExp(`^-\\s*${escaped}:\\s*(.+)\\s*$`, "m"));
  return match ? match[1].trim() : "";
}

function fieldCount(entry, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...entry.matchAll(new RegExp(`^-\\s*${escaped}\\s*:`, "gm"))].length;
}

function hasCheckedLine(entry, labelPattern) {
  return new RegExp(`^-\\s*\\[x\\]\\s*${labelPattern}\\s*$`, "m").test(entry);
}

function isLoopbackHostname(host) {
  const normalized = host.startsWith("[") && host.endsWith("]")
    ? host.slice(1, -1)
    : host;
  if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") return true;

  const octets = normalized.split(".");
  return octets.length === 4
    && octets.every((octet) => /^\d+$/.test(octet) && Number(octet) <= 255)
    && Number(octets[0]) === 127;
}

function isUsableProductionUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(value.replace(/`/g, ""));
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:"
      && url.username === ""
      && url.password === ""
      && host !== "localhost"
      && !isLoopbackHostname(host)
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

function isUsableEvidenceReference(value) {
  const normalized = value.toLowerCase();
  return normalized.length > 0
    && !normalized.includes("example")
    && !normalized.includes("localhost")
    && !normalized.includes(".local");
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
  const onboardingDateStatus = dateStatus(onboardingDate);
  const handoverDateStatus = dateStatus(handoverDate);
  const duplicateAuthorities = [
    ["고객명", fieldCount(entry, "고객명")],
    ["NOEMA URL", fieldCount(entry, "NOEMA URL")],
    ["지원 채널 합의", fieldCount(entry, "지원 채널 합의")],
    ["온보딩 완료일", fieldCount(entry, "온보딩 완료일")],
    ["운영 전환 승인일", fieldCount(entry, "운영 전환 승인일")],
    ["증빙 출처", fieldCount(entry, "증빙 출처") + fieldCount(entry, "evidence_source_kind")],
    ["계약/매출 증빙 경로", fieldCount(entry, "계약/매출 증빙 경로")],
    ["분석 데이터 경로", fieldCount(entry, "분석 데이터 경로")],
    ["trace_id 샘플", fieldCount(entry, "trace_id 샘플")],
    ["exchange_failure_rate", metricCount(entry, "exchange_failure_rate")],
    ["exchange_p95_latency_ms", metricCount(entry, "exchange_p95_latency_ms")],
  ].filter(([, count]) => count > 1);

  const failures = [];
  for (const [label] of duplicateAuthorities) failures.push(`${label} must appear exactly once`);
  if (!customerName) failures.push("고객명 required");
  if (!isUsableProductionUrl(noemaUrl)) failures.push("NOEMA URL must be a non-example HTTPS production URL");
  if (!isUsableSupportChannel(supportChannel)) failures.push("지원 채널 합의 must be a real non-local channel");
  if (onboardingDateStatus === "invalid") failures.push("온보딩 완료일 required");
  if (onboardingDateStatus === "future") failures.push("온보딩 완료일 must not be in the future");
  if (handoverDateStatus === "invalid") failures.push("운영 전환 승인일 required");
  if (handoverDateStatus === "future") failures.push("운영 전환 승인일 must not be in the future");
  if (!hasCheckedLine(entry, "운영 이관 승인")) failures.push("운영 이관 승인 required");
  if (!hasCheckedLine(entry, "(?:p95 <= 300|p95 < 300)")) failures.push("p95 threshold checkbox required");
  if (!hasCheckedLine(entry, "실패율 <= 0\\.02")) failures.push("failure-rate threshold checkbox required");
  if (failureRate === null || failureRate > 0.02) failures.push("exchange_failure_rate must be <= 0.02");
  if (p95 === null || p95 >= 300) failures.push("exchange_p95_latency_ms must be < 300");
  if (!evidencePath) failures.push("분석 데이터 경로 required");
  else if (!isUsableEvidenceReference(evidencePath)) failures.push("분석 데이터 경로 must be a non-example evidence reference");
  if (!traceId) failures.push("trace_id 샘플 required");
  else if (!isUsableEvidenceReference(traceId)) failures.push("trace_id 샘플 must be a non-example evidence reference");
  if (evidenceSourceKind !== "production") failures.push("증빙 출처 must be production");
  if (!contractEvidencePath) failures.push("계약/매출 증빙 경로 required");
  else if (!isUsableEvidenceReference(contractEvidencePath)) failures.push("계약/매출 증빙 경로 must be a non-example evidence reference");

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
