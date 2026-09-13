const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;
const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;

/**
 * Execute one Noema-owned Cloudflare control-plane JSON request with canonical
 * response negotiation, delegated authorization, and an absolute request bound.
 * Caller-provided content headers are preserved, but they cannot replace the
 * control-plane Accept or authorization authority.
 *
 * @param {string | URL} url Cloudflare control-plane URL
 * @param {string} token delegated Cloudflare API token
 * @param {string} operation operator-facing operation label
 * @param {RequestInit} [init] optional fetch initialization
 * @param {number} [maxResponseBytes] maximum accepted response body bytes
 * @returns {Promise<unknown>} bounded decoded Cloudflare result
 */
export async function requestCloudflareJson(
  url,
  token,
  operation,
  init = {},
  maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
) {
  const headers = new Headers(init.headers ?? {});
  headers.set("accept", "application/json");
  headers.set("authorization", `Bearer ${token}`);
  const response = await fetch(url, {
    ...init,
    headers,
    signal: AbortSignal.timeout(DEFAULT_REQUEST_TIMEOUT_MS),
  });
  return readBoundedCloudflareJsonResponse(response, operation, maxResponseBytes);
}

/**
 * Read one Cloudflare control-plane JSON response without buffering beyond the
 * configured byte ceiling. The ceiling is enforced while chunks arrive so a
 * provider response cannot consume unbounded memory before validation runs.
 *
 * @param {Response | {body?: unknown, ok: boolean, status: number}} response Cloudflare HTTP response
 * @param {string} operation operator-facing operation label
 * @param {number} [maxResponseBytes] maximum accepted response body bytes
 * @returns {Promise<unknown>} Cloudflare `result` when present, otherwise the decoded payload
 */
export async function readBoundedCloudflareJsonResponse(
  response,
  operation,
  maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
) {
  if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes <= 0) {
    throw new Error("Cloudflare response byte ceiling must be a positive safe integer");
  }

  const body = response?.body;
  if (!body || typeof body.getReader !== "function") {
    throw new Error(`${operation} response body is not stream-readable`);
  }

  let reader;
  try {
    reader = body.getReader();
  } catch {
    throw new Error(`${operation} response body is not stream-readable`);
  }
  const bytes = new Uint8Array(maxResponseBytes);
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) {
        throw new Error(`${operation} returned a malformed response chunk`);
      }
      if (totalBytes + value.byteLength > maxResponseBytes) {
        try {
          void reader.cancel("Cloudflare response byte ceiling exceeded").catch(() => undefined);
        } catch {
          // Cancellation is cleanup only; the byte-ceiling failure remains authoritative.
        }
        throw new Error(`${operation} returned an oversized response`);
      }
      bytes.set(value, totalBytes);
      totalBytes += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }

  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, totalBytes));
  } catch {
    throw new Error(`${operation} returned invalid UTF-8 (HTTP ${response.status})`);
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`${operation} returned non-JSON data (HTTP ${response.status})`);
  }

  if (!response.ok || payload?.success === false) {
    let codes = "";
    if (Array.isArray(payload?.errors)) {
      codes = payload.errors
        .map((error) => error?.code)
        .filter((code) => code !== undefined && code !== null && code !== "")
        .join(",");
    }
    throw new Error(`${operation} failed (HTTP ${response.status}${codes ? `; codes=${codes}` : ""})`);
  }

  return payload?.result ?? payload;
}