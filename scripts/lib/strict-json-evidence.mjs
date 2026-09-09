import { createHash } from "node:crypto";
import {
  hasDuplicateJsonObjectKeys,
  readBoundedReport,
} from "../normalize-commercial-readiness-evidence.mjs";

const fatalUtf8Decoder = new TextDecoder("utf-8", { fatal: true });

/** Build one fixed fail-closed JSON evidence result without retaining parser detail. */
function invalidEvidence(path, reason) {
  return { ok: false, path, reason };
}

function readStrictJsonEvidenceInternal(path, readRaw, includeSha256) {
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
    const value = JSON.parse(text);
    if (!includeSha256) {
      return { ok: true, path, value };
    }
    return {
      ok: true,
      path,
      value,
      sha256: createHash("sha256").update(raw).digest("hex"),
    };
  } catch {
    return invalidEvidence(path, "invalid_json");
  }
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
  return readStrictJsonEvidenceInternal(path, readRaw, false);
}

/**
 * Read and hash the same descriptor-safe bytes used for strict JSON parsing.
 * The digest is returned only after UTF-8, duplicate-key, and JSON validation
 * succeed, so rejected evidence cannot acquire a misleading retained-byte identity.
 */
export function readStrictJsonEvidenceWithSha256(
  path,
  { readRaw = readBoundedReport } = {},
) {
  return readStrictJsonEvidenceInternal(path, readRaw, true);
}
