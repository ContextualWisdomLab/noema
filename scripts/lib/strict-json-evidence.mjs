import {
  hasDuplicateJsonObjectKeys,
  readBoundedReport,
} from "../normalize-commercial-readiness-evidence.mjs";

const fatalUtf8Decoder = new TextDecoder("utf-8", { fatal: true });

/** Build one fixed fail-closed JSON evidence result without retaining parser detail. */
function invalidEvidence(path, reason) {
  return { ok: false, path, reason };
}

/**
 * Read bounded descriptor-safe JSON evidence without replacement decoding or
 * last-key-wins ambiguity.
 *
 * @param {string} path evidence path retained in the bounded audit result
 * @param {{readRaw?: (path: string) => Buffer | null}} options injectable descriptor-safe reader
 * @returns {{ok: true, path: string, value: unknown} | {ok: false, path: string, reason: string}} strict evidence result
 */
export function readStrictJsonEvidence(
  path,
  { readRaw = readBoundedReport } = {},
) {
  let raw;
  try {
    raw = readRaw(path);
  } catch {
    return invalidEvidence(path, "missing_or_unsafe");
  }
  if (!Buffer.isBuffer(raw)) {
    return invalidEvidence(path, "missing_or_unsafe");
  }
  try {
    const text = fatalUtf8Decoder.decode(raw);
    if (hasDuplicateJsonObjectKeys(text)) {
      return invalidEvidence(path, "duplicate_keys");
    }
    return { ok: true, path, value: JSON.parse(text) };
  } catch {
    return invalidEvidence(path, "invalid_json");
  }
}
