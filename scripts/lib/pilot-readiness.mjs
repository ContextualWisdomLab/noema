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

/**
 * Read the first exact metric authority from a pilot entry.
 *
 * The historical regex treated the leading and trailing backticks around a
 * metric label as independently optional. Preserve that compatibility while
 * avoiding dynamically constructed regular expressions.
 *
 * @param {string} entry pilot entry text
 * @param {string} name exact metric label
 * @returns {number | null} parsed non-negative decimal, or null when absent/invalid
 */
function metricValue(entry, name) {
  const value = bulletFieldValues(entry, name, true)[0];
  if (value === undefined) return null;
  return /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : null;
}

/**
 * Count exact occurrences of a metric authority using the historical optional
 * backtick grammar.
 *
 * @param {string} entry pilot entry text
 * @param {string} name exact metric label
 * @returns {number} number of matching bullet fields
 */
function metricCount(entry, name) {
  return bulletFieldValues(entry, name, true).length;
}

/**
 * Read the first exact plain-label field value from a pilot entry.
 *
 * Plain authority labels intentionally do not inherit metric backtick syntax
 * or whitespace-before-colon syntax that the historical duplicate counter
 * accepted.
 *
 * @param {string} entry pilot entry text
 * @param {string} label exact field label
 * @returns {string} trimmed value, or an empty string when absent
 */
function fieldValue(entry, label) {
  return bulletFieldValues(entry, label, false, false)[0] ?? "";
}

/**
 * Count exact plain-label authority fields without widening their grammar.
 *
 * The historical duplicate counter accepts whitespace before the colon, so
 * this path preserves that behavior even though fieldValue() does not.
 *
 * @param {string} entry pilot entry text
 * @param {string} label exact field label
 * @returns {number} number of matching bullet fields
 */
function fieldCount(entry, label) {
  return bulletFieldValues(entry, label, false).length;
}

/**
 * Extract values from top-level bullet fields using structural exact-label
 * matching rather than dynamically constructed regular expressions.
 *
 * @param {string} entry pilot entry text
 * @param {string} label exact field label
 * @param {boolean} allowBackticks whether independently optional boundary backticks are accepted on the key
 * @param {boolean} allowWhitespaceBeforeColon whether trailing key whitespace before `:` is accepted
 * @returns {string[]} trimmed values for every matching bullet field
 */
function bulletFieldValues(entry, label, allowBackticks, allowWhitespaceBeforeColon = true) {
  return entry.split("\n").flatMap((line) => {
    if (!line.startsWith("-")) return [];
    const content = line.slice(1).trimStart();
    const separator = content.indexOf(":");
    if (separator < 0) return [];
    const rawKeySegment = content.slice(0, separator);
    if (!allowWhitespaceBeforeColon && rawKeySegment !== rawKeySegment.trimEnd()) return [];
    let key = rawKeySegment.trim();
    if (allowBackticks && key.startsWith("`")) key = key.slice(1);
    if (allowBackticks && key.endsWith("`")) key = key.slice(0, -1);
    return key === label ? [content.slice(separator + 1).trim()] : [];
  });
}

/**
 * Decide whether an entry contains an exact checked bullet for one of the
 * accepted authority labels.
 *
 * @param {string} entry pilot entry text
 * @param {string | string[]} labels accepted checked-line labels
 * @returns {boolean} true only for an exact `[x]` label match
 */
function hasCheckedLine(entry, labels) {
  const acceptedLabels = Array.isArray(labels) ? labels : [labels];
  return entry.split("\n").some((line) => {
    const content = line.startsWith("-") ? line.slice(1).trimStart() : "";
    return content.startsWith("[x]") && acceptedLabels.includes(content.slice("[x]".length).trim());
  });
}

function isLocalOnlyHostname(host) {
  const normalized = host.startsWith("[") && host.endsWith("]")
    ? host.slice(1, -1)
    : host;
  if (normalized === "::" || normalized === "::1" || normalized === "0.0.0.0") return true;
  if (/^::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}$/i.test(normalized)) return true;
  return /^127(?:\.\d{1,3}){3}$/.test(normalized);
}

function isUsableProductionUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(value.replace(/`/g, ""));
    const host = url.hostname.toLowerCase();
    const canonicalHost = host.endsWith(".") ? host.slice(0, -1) : host;
    return url.protocol === "https:"
      && url.username === ""
      && url.password === ""
      && canonicalHost !== "localhost"
      && !canonicalHost.endsWith(".localhost")
      && !isLocalOnlyHostname(canonicalHost)
      && !canonicalHost.endsWith(".local")
      && !canonicalHost.includes("example");
  } catch {
    return false;
  }
}

function isUsableSupportChannel(value) {
  const normalized = value.toLowerCase();
  return normalized.length > 0
    && !normalized.includes(".local")
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

/**
 * Evaluate one production-pilot record as an authority-bearing readiness unit.
 *
 * Duplicate authorities fail closed before business thresholds are considered;
 * production URL, evidence, handover, latency, failure-rate, and trace fields
 * must all satisfy their existing contracts.
 *
 * @param {string} entry one `## 항목` section body
 * @returns {{customerName: string, passed: boolean, failures: string[]}} deterministic pilot decision
 */
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
  if (!hasCheckedLine(entry, ["p95 <= 300", "p95 < 300"])) failures.push("p95 threshold checkbox required");
  if (!hasCheckedLine(entry, "실패율 <= 0.02")) failures.push("failure-rate threshold checkbox required");
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
