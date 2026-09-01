/** Maximum byte-equivalent length for Noema execution identities in printable ASCII. */
export const MAX_EXECUTION_ID_LENGTH = 128;

const EXECUTION_ID_PATTERN = /^[\x21-\x7e]{1,128}$/u;

/** Returns whether a runtime execution identity is canonical for cross-context comparison. */
export function isCanonicalExecutionId(executionId: string): boolean {
  return EXECUTION_ID_PATTERN.test(executionId);
}
