const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;

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

  const reader = body.getReader();
  const chunks = [];
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
          await reader.cancel("Cloudflare response byte ceiling exceeded");
        } catch {
          // Cancellation is cleanup only; the byte-ceiling failure remains authoritative.
        }
        throw new Error(`${operation} returned an oversized response`);
      }
      chunks.push(value);
      totalBytes += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
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
