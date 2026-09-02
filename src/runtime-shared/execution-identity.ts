/** Maximum byte-equivalent length for Noema execution identities in printable ASCII. */
export const MAX_EXECUTION_ID_LENGTH = 128;

const EXECUTION_ID_PATTERN = /^[\x21-\x7e]{1,128}$/u;

/**
 * Returns whether a runtime execution identity is canonical for cross-context comparison.
 *
 * Runtime callers may arrive through JavaScript, decoded JSON, or foreign adapters that do not
 * preserve TypeScript's static `string` contract, so the parameter is typed `unknown` rather than
 * `string`: callers holding an already-validated `string` may pass it directly, and callers
 * holding an untrusted `unknown` field (for example one read from a hostile-input snapshot) may
 * pass it directly too, without an unchecked cast at the call site. Reject non-string values
 * before the regular expression runs so JavaScript coercion cannot manufacture execution
 * authority from numbers, booleans, arrays, or objects with attacker-controlled string conversion.
 *
 * @param executionId Execution identity received from a runtime or integration boundary.
 * @returns `true` only for a non-empty printable-ASCII canonical identity within the length bound.
 */
export function isCanonicalExecutionId(executionId: unknown): boolean {
  return typeof executionId === "string" && EXECUTION_ID_PATTERN.test(executionId);
}
