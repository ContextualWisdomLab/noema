const proceduralErrors = new WeakSet<object>();

const PROCEDURAL_ERROR_CODES = [
  "unreadable_input",
  "invalid_record",
  "invalid_array",
  "invalid_identity",
  "invalid_digest",
  "invalid_integer",
  "invalid_text",
  "graph_budget_exceeded",
  "unadmitted_graph",
  "unadmitted_session",
  "unadmitted_decision",
  "unadmitted_evaluation_evidence",
  "unadmitted_authenticated_evaluation",
  "evaluation_evidence_digest_mismatch",
  "evaluation_handoff_signer_mismatch",
  "evaluation_handoff_envelope_mismatch",
  "evaluation_handoff_time_invalid",
  "evaluation_handoff_expired",
  "evaluation_handoff_signature_invalid",
  "unsupported_schema",
  "duplicate_node",
  "missing_start",
  "invalid_relation",
  "dangling_edge",
  "duplicate_edge",
  "scope_mismatch",
  "duplicate_case",
  "receipt_mismatch",
  "case_set_mismatch",
  "invalid_score",
  "candidate_lineage_mismatch",
  "insufficient_cases",
  "holdout_leakage",
] as const;

type ProceduralErrorCode = (typeof PROCEDURAL_ERROR_CODES)[number];
const proceduralErrorCodeSet = new Set<string>(PROCEDURAL_ERROR_CODES);

/** Error shape used by procedural-graph validation; constructing this exported class does not confer the module-local provenance required for trusted normalization. */
export class ProceduralGraphError extends Error {
  constructor(code: string) { super(code); this.name = "ProceduralGraphError"; }
}

function ownedProceduralError(code: ProceduralErrorCode): ProceduralGraphError {
  const error = new ProceduralGraphError(code);
  proceduralErrors.add(error);
  return error;
}

/**
 * Rejects malformed procedural-graph input with a closed local error code instead of propagating
 * untrusted values into logs, responses, or authority decisions. Runtime membership is checked even
 * for JavaScript/deep-import callers so this helper cannot mint attacker-selected trusted error text.
 * @param code Stable internal failure code selected by the deterministic admission boundary.
 * @returns Never returns; always throws a locally branded `ProceduralGraphError` with a closed code.
 */
export function rejectProceduralInput(code: ProceduralErrorCode): never {
  const stableCode: ProceduralErrorCode = proceduralErrorCodeSet.has(code as string) ? code : "unreadable_input";
  throw ownedProceduralError(stableCode);
}

/**
 * Preserves errors created by this procedural aggregate and normalizes every foreign thrown value,
 * including caller-constructed `ProceduralGraphError` objects and revoked proxies, into one fixed
 * unreadable-input failure without prototype inspection or attacker-controlled message propagation.
 * @param error Unknown value caught while reading or validating an untrusted procedural input.
 * @returns Never returns; rethrows a locally owned closed-code procedural error or throws `unreadable_input`.
 */
export function normalizeProceduralError(error: unknown): never {
  // WeakSet membership does not invoke a thrown object's proxy/prototype traps. Public class construction is not admission.
  if (proceduralErrors.has(error as object)) throw error;
  throw ownedProceduralError("unreadable_input");
}

/**
 * Copies an exact-key plain record from own data descriptors so accessors cannot change identity,
 * scope, evidence, or authorization-shaped fields between validation and later use.
 * @param value Unknown record supplied at the procedural aggregate boundary.
 * @param keys Exact string keys permitted on the record; extra and missing keys are rejected.
 * @returns A null-prototype snapshot containing only the admitted own data-descriptor values.
 */
export function readProceduralRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) rejectProceduralInput("invalid_record");
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) rejectProceduralInput("invalid_record");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Reflect.ownKeys(descriptors);
  if (actual.length !== keys.length || actual.some(key => typeof key !== "string" || !keys.includes(key))) rejectProceduralInput("invalid_record");
  const result: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!Object.hasOwn(descriptor, "value")) rejectProceduralInput("invalid_record");
    result[key] = descriptor.value;
  }
  return result;
}

/**
 * Copies a dense bounded array by own data descriptors, rejecting sparse elements, metadata fields,
 * accessor elements, non-arrays, and lengths outside the caller's explicit resource limits.
 * @param value Unknown value expected to be a dense ordinary array.
 * @param minimum Inclusive minimum number of elements accepted by this boundary.
 * @param maximum Inclusive maximum number of elements accepted by this boundary.
 * @returns A fresh ordinary array containing the snapshotted admitted element values.
 */
export function readProceduralArray(value: unknown, minimum: number, maximum: number): unknown[] {
  if (!Array.isArray(value)) rejectProceduralInput("invalid_array");
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
  const length = descriptors.length.value as number;
  if (length < minimum || length > maximum || Reflect.ownKeys(descriptors).length !== length + 1) rejectProceduralInput("invalid_array");
  const result: unknown[] = [];
  for (let i = 0; i < length; i++) {
    const descriptor = descriptors[String(i)];
    if (descriptor === undefined || !Object.hasOwn(descriptor, "value")) rejectProceduralInput("invalid_array");
    result.push(descriptor.value);
  }
  return result;
}

/**
 * Admits a bounded ASCII procedural identity without JavaScript string coercion, whitespace repair,
 * or interpretation of objects as authority-bearing identifiers.
 * @param value Unknown candidate identifier from graph, scope, task, execution, or case data.
 * @returns The original string after it satisfies the local bounded identity grammar.
 */
export function proceduralIdentity(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(value)) rejectProceduralInput("invalid_identity");
  return value;
}

/**
 * Admits an exact lowercase SHA-256 hexadecimal digest used to bind graph and evaluation evidence;
 * labels, branch names, shortened hashes, and coerced values are rejected.
 * @param value Unknown candidate digest read from procedural input.
 * @returns The exact admitted 64-character lowercase hexadecimal digest.
 */
export function proceduralDigest(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) rejectProceduralInput("invalid_digest");
  return value;
}

/**
 * Admits a safe integer inside explicit inclusive bounds so revisions, budgets, and violation counts
 * cannot become fractional, non-finite, negative, or silently coerced runtime values.
 * @param value Unknown candidate integer supplied by the caller.
 * @param minimum Inclusive lower bound required by the owning procedural operation.
 * @param maximum Inclusive upper bound required by the owning procedural operation.
 * @returns The original finite safe integer after all bounds are satisfied.
 */
export function proceduralInteger(value: unknown, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) rejectProceduralInput("invalid_integer");
  return value;
}

/**
 * Admits bounded advisory text as inert data, rejecting non-strings, NUL characters, and values above
 * the local 2048-code-unit budget without treating their contents as instructions or authority.
 * @param value Unknown candidate condition, guidance, or pitfall text.
 * @returns The original admitted string for immutable graph construction.
 */
export function proceduralText(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048 || value.includes("\0")) rejectProceduralInput("invalid_text");
  return value;
}

/**
 * Computes the local SHA-256 identity of canonicalized procedural data after enforcing a one-mebibyte
 * serialized byte budget; this hash is local evidence, not a signature or released wire standard.
 * @param value Canonically ordered copied data owned by the procedural aggregate.
 * @returns Lowercase 64-character SHA-256 hexadecimal content digest.
 */
export async function proceduralHash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  if (bytes.length > 1_048_576) rejectProceduralInput("graph_budget_exceeded");
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}