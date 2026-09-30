const CONTRACT_VERSION = "noema.continuation-dispatch.v1" as const;
const CENTRAL_REPOSITORY = "ContextualWisdomLab/.github" as const;
const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const SOURCE_REPOSITORY_PATTERN = /^ContextualWisdomLab\/[A-Za-z0-9._-]+$/u;
const FORBIDDEN_REF_CHARACTER_PATTERN = /[\u0000-\u0020~^:?*\[\\]/u;
const REQUEST_KEYS = [
  "central_repository",
  "contract_version",
  "dispatch_action",
  "expected_base_ref",
  "expected_base_sha",
  "expected_head_sha",
  "pull_request_number",
  "source_repository",
  "transport_retry_attempt",
] as const;
const REQUEST_KEY_SET = JSON.stringify([...REQUEST_KEYS].sort());
const WORKFLOW_IDENTITY_KEY_SET = JSON.stringify(["workflow_sha"]);

/**
 * Names the only continuation actions released by the v1 Noema broker contract.
 * Each value maps to one fixed central event and cannot select a provider or workflow.
 */
export type ContinuationDispatchAction =
  | "noema_review_continuation"
  | "strix_scan_continuation";

/**
 * Carries one validated v1 request for an exact central continuation dispatch.
 * Every identity remains immutable after admission so it can safely enter idempotency state.
 */
export interface ContinuationDispatchRequest {
  readonly contract_version: typeof CONTRACT_VERSION;
  readonly dispatch_action: ContinuationDispatchAction;
  readonly central_repository: typeof CENTRAL_REPOSITORY;
  readonly source_repository: string;
  readonly pull_request_number: number;
  readonly expected_head_sha: string;
  readonly expected_base_sha: string;
  readonly expected_base_ref: string;
  readonly transport_retry_attempt: 1 | 2;
}

/** Verified immutable reusable-workflow identity included in dispatch idempotency. */
export interface ContinuationWorkflowIdentity {
  readonly workflow_sha: string;
}

/**
 * Exposes the fixed central event selected by one released continuation action.
 * Callers cannot supply an arbitrary GitHub event type through this mapping.
 */
export interface ContinuationDispatchMapping {
  readonly eventType: "noema-review" | "strix-scan";
}

/** Raised when untrusted continuation request or identity material is not canonical. */
export class ContinuationDispatchContractError extends Error {
  /** Creates a fail-closed continuation contract error with a stable diagnostic. */
  constructor(message: string) {
    super(message);
    this.name = "ContinuationDispatchContractError";
  }
}

function rejectContract(message: string): never {
  throw new ContinuationDispatchContractError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: string): boolean {
  return JSON.stringify(Object.keys(value).sort()) === expected;
}

function isCanonicalCommitSha(value: unknown): value is string {
  return typeof value === "string" && SHA_PATTERN.test(value);
}

function isCanonicalSourceRepository(value: unknown): value is string {
  if (typeof value !== "string" || !SOURCE_REPOSITORY_PATTERN.test(value)) return false;
  const repositoryName = value.slice(value.indexOf("/") + 1);
  return repositoryName !== "." && repositoryName !== "..";
}

function containsUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = value.charCodeAt(index + 1);
      if (index + 1 >= value.length || nextCodeUnit < 0xdc00 || nextCodeUnit > 0xdfff) return true;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function isCanonicalBaseRef(value: unknown): value is string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value === "@"
    || value.startsWith("-")
    || value.startsWith("/")
    || value.endsWith("/")
    || value.endsWith(".")
    || value.includes("..")
    || value.includes("@{")
    || value.includes("//")
    || FORBIDDEN_REF_CHARACTER_PATTERN.test(value)
    || /\s/u.test(value)
    || containsUnpairedSurrogate(value)
  ) {
    return false;
  }
  return value.split("/").every(
    (component) => component.length > 0 && !component.startsWith(".") && !component.endsWith(".lock"),
  );
}

function decodedRootKeysContainDuplicate(text: string): boolean {
  let depth = 0;
  let inString = false;
  let escaped = false;
  let stringStart = -1;
  const seen = new Set<string>();

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === "\\") {
        escaped = true;
        continue;
      }
      if (character !== "\"") continue;

      inString = false;
      if (depth !== 1) continue;
      let lookahead = index + 1;
      while (lookahead < text.length && /\s/u.test(text[lookahead]!)) lookahead += 1;
      if (text[lookahead] !== ":") continue;

      const encodedKey = text.slice(stringStart + 1, index);
      // The complete text has already passed JSON.parse, so this exact encoded key is valid JSON string content.
      const decodedKey = JSON.parse(`"${encodedKey}"`) as string;
      if (seen.has(decodedKey)) return true;
      seen.add(decodedKey);
      continue;
    }

    if (character === "\"") {
      inString = true;
      stringStart = index;
    } else if (character === "{" || character === "[") {
      depth += 1;
    } else if (character === "}" || character === "]") {
      depth -= 1;
    }
  }
  return false;
}

function admitContinuationDispatchRequest(value: unknown): ContinuationDispatchRequest {
  if (!isRecord(value) || !hasExactKeys(value, REQUEST_KEY_SET)) {
    return rejectContract("continuation dispatch request must contain exactly the released members");
  }
  if (value.contract_version !== CONTRACT_VERSION) {
    return rejectContract("continuation dispatch request contract_version is not released");
  }
  if (
    value.dispatch_action !== "noema_review_continuation"
    && value.dispatch_action !== "strix_scan_continuation"
  ) {
    return rejectContract("continuation dispatch request dispatch_action is not released");
  }
  if (value.central_repository !== CENTRAL_REPOSITORY) {
    return rejectContract("continuation dispatch request central_repository is not canonical");
  }
  if (!isCanonicalSourceRepository(value.source_repository)) {
    return rejectContract("continuation dispatch request source_repository is not canonical");
  }
  if (
    typeof value.pull_request_number !== "number"
    || !Number.isSafeInteger(value.pull_request_number)
    || value.pull_request_number <= 0
  ) {
    return rejectContract("continuation dispatch request pull_request_number is not a positive safe integer");
  }
  if (!isCanonicalCommitSha(value.expected_head_sha)) {
    return rejectContract("continuation dispatch request expected_head_sha is not canonical");
  }
  if (!isCanonicalCommitSha(value.expected_base_sha)) {
    return rejectContract("continuation dispatch request expected_base_sha is not canonical");
  }
  if (!isCanonicalBaseRef(value.expected_base_ref)) {
    return rejectContract("continuation dispatch request expected_base_ref is not canonical");
  }
  if (value.transport_retry_attempt !== 1 && value.transport_retry_attempt !== 2) {
    return rejectContract("continuation dispatch request transport_retry_attempt is not released");
  }

  return Object.freeze({
    contract_version: value.contract_version,
    dispatch_action: value.dispatch_action,
    central_repository: value.central_repository,
    source_repository: value.source_repository,
    pull_request_number: value.pull_request_number,
    expected_head_sha: value.expected_head_sha,
    expected_base_sha: value.expected_base_sha,
    expected_base_ref: value.expected_base_ref,
    transport_retry_attempt: value.transport_retry_attempt,
  });
}

function admitWorkflowIdentity(value: unknown): ContinuationWorkflowIdentity {
  if (
    !isRecord(value)
    || !hasExactKeys(value, WORKFLOW_IDENTITY_KEY_SET)
    || !isCanonicalCommitSha(value.workflow_sha)
  ) {
    return rejectContract("continuation dispatch workflow_sha is not canonical");
  }
  return Object.freeze({ workflow_sha: value.workflow_sha });
}

function canonicalFlatObject(value: Readonly<Record<string, string | number>>): string {
  return `{${Object.keys(value).sort().map(
    (key) => `${JSON.stringify(key)}:${JSON.stringify(value[key])}`,
  ).join(",")}}`;
}

/**
 * Parses one UTF-8-decoded JSON text as the exact v1 continuation request.
 * Duplicate decoded root keys, additional values, unknown members, typed lookalikes, and non-canonical identities fail closed.
 * @param text Untrusted request text after the public request-body byte and UTF-8 boundary.
 * @returns An immutable request containing only validated contract members.
 * @throws {ContinuationDispatchContractError} When syntax, shape, type, or canonical identity validation fails.
 */
export function parseContinuationDispatchRequest(text: string): ContinuationDispatchRequest {
  if (typeof text !== "string") {
    return rejectContract("continuation dispatch request must be JSON text");
  }
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    return rejectContract("continuation dispatch request is not one complete JSON value");
  }
  if (decodedRootKeysContainDuplicate(text)) {
    return rejectContract("continuation dispatch request contains duplicate decoded members");
  }
  return admitContinuationDispatchRequest(value);
}

/**
 * Maps one released caller action to the only central event type it may emit.
 * @param action Candidate continuation action, revalidated at runtime despite its static type.
 * @returns The immutable fixed central event mapping.
 * @throws {ContinuationDispatchContractError} When the action is not released.
 */
export function dispatchMapping(action: ContinuationDispatchAction): ContinuationDispatchMapping {
  if (action === "noema_review_continuation") return Object.freeze({ eventType: "noema-review" });
  if (action === "strix_scan_continuation") return Object.freeze({ eventType: "strix-scan" });
  return rejectContract("continuation dispatch action is not released");
}

/**
 * Serializes the exact request and verified workflow SHA using RFC 8785 lexicographic object-key order.
 * @param request Candidate request; every member is revalidated before it gains idempotency authority.
 * @param workflowIdentity Verified reusable-workflow commit identity.
 * @returns Deterministic canonical JSON bytes represented as a string.
 * @throws {ContinuationDispatchContractError} When request or workflow identity material is not canonical.
 */
export function canonicalContinuationRequest(
  request: ContinuationDispatchRequest,
  workflowIdentity: ContinuationWorkflowIdentity,
): string {
  const admittedRequest = admitContinuationDispatchRequest(request);
  const admittedWorkflow = admitWorkflowIdentity(workflowIdentity);
  return canonicalFlatObject({ ...admittedRequest, workflow_sha: admittedWorkflow.workflow_sha });
}

/**
 * Computes the lowercase SHA-256 digest of the exact canonical continuation identity.
 * @param request Candidate request revalidated by the canonical serializer.
 * @param workflowIdentity Verified reusable-workflow commit identity.
 * @returns A 64-character lowercase hexadecimal digest.
 * @throws {ContinuationDispatchContractError} When canonical request material is invalid.
 */
export async function continuationRequestDigest(
  request: ContinuationDispatchRequest,
  workflowIdentity: ContinuationWorkflowIdentity,
): Promise<string> {
  const canonicalBytes = new TextEncoder().encode(
    canonicalContinuationRequest(request, workflowIdentity),
  );
  const digest = await crypto.subtle.digest("SHA-256", canonicalBytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
