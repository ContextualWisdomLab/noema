/** Fail-closed Tool / Capability admission for external Claude community plugins. */

export const EXTERNAL_EXTENSION_ADMISSION_STATES = Object.freeze([
  "discovered",
  "source_pinned",
  "statically_scanned",
  "quarantined",
  "capability_reviewed",
  "approved_for_pilot",
  "active",
  "suspended",
  "superseded",
  "rejected",
  "expired",
] as const);

/**
 * Lifecycle state for a pinned external extension; callers must treat every state except active as non-invocation authority.
 */
export type ExternalExtensionAdmissionState =
  (typeof EXTERNAL_EXTENSION_ADMISSION_STATES)[number];

/**
 * Adoption mode admitted by Noema; external plugin wrappers remain developer-assist capabilities rather than product-runtime authority.
 */
export type ExternalExtensionAdoptionMode = "developer_assist";
/**
 * Execution-mode envelope accepted at activation and invocation boundaries so product-runtime plugin execution can fail closed explicitly.
 */
export type ExternalExtensionExecutionMode = "developer_assist" | "product_runtime";

const COMMIT_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const TWO_WORD_SNAKE_PATTERN = /^[a-z][a-z0-9]*_[a-z][a-z0-9]*(?:_[a-z][a-z0-9]*)*$/u;
const REPOSITORY_PATTERN =
  /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?\/[A-Za-z0-9._-]+$/u;
const RELATIVE_PATH_PATTERN = /^(?!\/)[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/u;
const PLUGIN_NAME_PATTERN = /^[a-z][a-z0-9-]{1,63}$/u;
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const LICENSE_PATTERN = /^[A-Za-z0-9.+-]+(?: OR [A-Za-z0-9.+-]+)*$/u;
const REFERENCE_PATTERN = /^urn:cwl:[a-z0-9][a-z0-9._:-]{3,253}$/u;
const RECEIPT_ID_PATTERN = /^[a-z][a-z0-9-]{7,63}$/u;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const MAX_BOUNDED_LIST = 16;
const FORBIDDEN_AUTHORITY = Object.freeze(
  new Set([
    "openai_api_key",
    "nvidia_nim_api_key",
    "nvidia_nim_api_key_sub",
    "bytez_api_key",
    "openrouter_api_key",
    "copilot_github_token",
    "github_admin",
    "github_merge",
    "github_release",
    "github_deploy",
    "unrestricted_shell",
    "host_filesystem",
    "docker_socket",
    "package_manager",
    "unrestricted_network",
    "browser_profile",
  ]),
);
const SECRET_LEAK_PATTERN =
  /openai_api_key|nvidia_nim_api_key|bytez_api_key|openrouter_api_key|copilot_github_token|begin [a-z ]*private key/iu;
const POLICY_PROMOTION_PATTERN =
  /\b(?:trusted policy|new capability|ignore previous|you are now)\b/iu;

const DESCRIPTOR_FIELDS = Object.freeze([
  "external_extension_id",
  "capability_code",
  "adoption_mode",
  "upstream_repository",
  "upstream_commit_sha",
  "upstream_path",
  "artifact_sha256",
  "marketplace_entry_sha256",
  "plugin_name",
  "plugin_version",
  "license_expression",
  "license_evidence_reference",
  "input_schema_reference",
  "output_schema_reference",
  "required_filesystem_capabilities",
  "required_network_capabilities",
  "required_process_capabilities",
  "required_secret_handles",
  "required_mcp_servers",
  "allowed_product_repositories",
  "allowed_execution_roles",
  "isolation_profile_reference",
  "egress_policy_reference",
  "appguardrail_scan_receipt",
  "quarantine_analysis_receipt",
  "approval_status",
  "valid_from",
  "valid_to",
  "supersedes_extension_id",
  "rollback_reference",
] as const);

const CATALOG_FIELDS = Object.freeze([
  "external_extension_id",
  "upstream_repository",
  "upstream_commit_sha",
  "upstream_path",
  "artifact_sha256",
  "marketplace_entry_sha256",
] as const);

const RECEIPT_FIELDS = Object.freeze([
  "receipt_id",
  "artifact_sha256",
  "policy_version",
  "producer",
] as const);

/** Mutable construction shape accepted at the untrusted external-extension boundary. */
export interface ExternalExtensionDescriptor {
  external_extension_id: string;
  capability_code: string;
  adoption_mode: ExternalExtensionAdoptionMode;
  upstream_repository: string;
  upstream_commit_sha: string;
  upstream_path: string;
  artifact_sha256: string;
  marketplace_entry_sha256: string;
  plugin_name: string;
  plugin_version: string;
  license_expression: string;
  license_evidence_reference: string;
  input_schema_reference: string;
  output_schema_reference: string;
  required_filesystem_capabilities: readonly string[];
  required_network_capabilities: readonly string[];
  required_process_capabilities: readonly string[];
  required_secret_handles: readonly string[];
  required_mcp_servers: readonly string[];
  allowed_product_repositories: readonly string[];
  allowed_execution_roles: readonly string[];
  isolation_profile_reference: string;
  egress_policy_reference: string;
  appguardrail_scan_receipt: string;
  quarantine_analysis_receipt: string;
  approval_status: ExternalExtensionAdmissionState;
  valid_from: string;
  valid_to: string;
  supersedes_extension_id: string;
  rollback_reference: string;
}

/**
 * Independently pinned catalog identity that binds one extension to immutable upstream source, artifact, and marketplace evidence digests.
 */
export interface TrustedExtensionCatalogEntry {
  external_extension_id: string;
  upstream_repository: string;
  upstream_commit_sha: string;
  upstream_path: string;
  artifact_sha256: string;
  marketplace_entry_sha256: string;
}

/**
 * Independently pinned AppGuardrail or quarantine receipt that binds an analyzed artifact to the producing owner and reviewed policy version.
 */
export interface TrustedExtensionScanReceipt {
  receipt_id: string;
  artifact_sha256: string;
  policy_version: string;
  producer: "appguardrail" | "quarantine-sandbox-runtime";
}

/**
 * Trusted lookup port for catalog and scan identities; implementations supply operator-controlled pins instead of trusting plugin assertions.
 */
export interface ExternalExtensionAuthority {
  resolveCatalog(extensionId: string): TrustedExtensionCatalogEntry | null;
  resolveScanReceipt(receiptId: string): TrustedExtensionScanReceipt | null;
}

/**
 * Frozen admission snapshot pairing the validated extension descriptor with the immutable catalog identity that authenticated its source bytes.
 */
export interface AdmittedExternalExtension {
  readonly descriptor: Readonly<ExternalExtensionDescriptor>;
  readonly catalog: Readonly<TrustedExtensionCatalogEntry>;
}

/**
 * Product-scoped activation that binds an admitted artifact to one repository, execution role, reviewed policy version, and activation instant.
 */
export interface ExternalExtensionActivation {
  readonly activation_id: string;
  readonly external_extension_id: string;
  readonly product_repository: string;
  readonly execution_role: string;
  readonly execution_mode: ExternalExtensionExecutionMode;
  readonly policy_version: string;
  readonly artifact_sha256: string;
  readonly activated_at: string;
}

/**
 * Untrusted invocation envelope presented at the Tool / Capability boundary; payload fields are validated before any bounded receipt can be emitted.
 */
export interface ExternalExtensionInvocationRequest {
  activation_id: string;
  invocation_id: string;
  execution_mode: ExternalExtensionExecutionMode;
  invoked_at: string;
  instruction: string;
  observed_content: string;
  promote_observed_content: boolean;
  secret_material: string;
  product_record: string;
  hidden_reasoning: string;
}

/**
 * Deterministic invocation receipt restricted to identity and provenance fields so secrets, product records, and hidden reasoning cannot be retained.
 */
export interface ExternalExtensionInvocationReceipt {
  readonly receipt_id: string;
  readonly external_extension_id: string;
  readonly capability_code: string;
  readonly artifact_sha256: string;
  readonly product_repository: string;
  readonly invoked_at: string;
}

/**
 * Activation admission result distinguishing a newly accepted product-scoped activation from an idempotent replay of the exact retained event.
 */
export type ExternalExtensionActivationAdmission =
  | { readonly kind: "accepted"; readonly activation: ExternalExtensionActivation }
  | { readonly kind: "replay"; readonly activation: ExternalExtensionActivation };

/**
 * Invocation admission result distinguishing a newly accepted bounded receipt from an idempotent replay of the exact retained invocation event.
 */
export type ExternalExtensionInvocationAdmission =
  | { readonly kind: "accepted"; readonly receipt: ExternalExtensionInvocationReceipt }
  | { readonly kind: "replay"; readonly receipt: ExternalExtensionInvocationReceipt };

/** Raised when an external extension cannot be admitted, activated, or invoked. */
export class ExternalExtensionAdmissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExternalExtensionAdmissionError";
  }
}

function reject(message: string): never {
  throw new ExternalExtensionAdmissionError(message);
}

function readValue(candidate: object, field: string): unknown {
  try {
    return (candidate as Record<string, unknown>)[field];
  } catch {
    return reject(`${field} could not be read`);
  }
}

function requirePattern(value: unknown, pattern: RegExp, label: string): string {
  if (typeof value !== "string") reject(`${label} must be a string`);
  if (!pattern.test(value)) reject(`${label} is not canonical`);
  return value;
}

function requireRelativePath(value: unknown, label: string): string {
  const path = requirePattern(value, RELATIVE_PATH_PATTERN, label);
  if (path.split("/").some((segment) => segment === "." || segment === "..")) {
    reject(`${label} is not canonical`);
  }
  return path;
}

function requireExactString(value: unknown, expected: string, label: string): string {
  if (typeof value !== "string") reject(`${label} must be a string`);
  if (value !== expected) reject(`${label} must equal ${expected}`);
  return value;
}

function requireTimestamp(value: unknown, label: string): string {
  const timestamp = requirePattern(value, TIMESTAMP_PATTERN, label);
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== timestamp) {
    reject(`${label} is not a real canonical UTC instant`);
  }
  return timestamp;
}

function requireStringList(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) reject(`${label} must be an array`);
  const items = value as unknown[];
  let count: number;
  try {
    count = items.length;
  } catch {
    return reject(`${label} could not be read`);
  }
  if (count > MAX_BOUNDED_LIST) {
    reject(`${label} must contain at most ${MAX_BOUNDED_LIST} entries`);
  }
  const snapshot: string[] = [];
  for (let index = 0; index < count; index += 1) {
    let item: unknown;
    try {
      item = items[index];
    } catch {
      return reject(`${label} could not be read`);
    }
    if (typeof item !== "string") reject(`${label} must contain only strings`);
    if (FORBIDDEN_AUTHORITY.has(item)) {
      reject(`${label} requests forbidden authority`);
    }
    snapshot.push(item);
  }
  if (new Set(snapshot).size !== snapshot.length) reject(`${label} must not contain duplicates`);
  return Object.freeze(snapshot);
}

function requireEmptyCapabilityList(value: unknown, label: string): readonly string[] {
  const snapshot = requireStringList(value, label);
  if (snapshot.length !== 0) reject(`${label} must be empty for developer_assist`);
  return snapshot;
}

function optionalIdentifier(value: unknown, label: string): string {
  if (typeof value !== "string") reject(`${label} must be a string`);
  if (value === "") return value;
  return requirePattern(value, TWO_WORD_SNAKE_PATTERN, label);
}

function optionalReference(value: unknown, label: string): string {
  if (typeof value !== "string") reject(`${label} must be a string`);
  if (value === "") return value;
  return requirePattern(value, REFERENCE_PATTERN, label);
}

function snapshotDescriptor(candidate: ExternalExtensionDescriptor): Record<string, unknown> {
  if (candidate === null || typeof candidate !== "object") {
    return reject("extension descriptor must be an object");
  }
  const raw: Record<string, unknown> = {};
  for (const field of DESCRIPTOR_FIELDS) {
    raw[field] = readValue(candidate, field);
  }
  return raw;
}

function snapshotCatalog(candidate: TrustedExtensionCatalogEntry): Record<string, unknown> {
  if (candidate === null || typeof candidate !== "object") {
    return reject("catalog entry must be an object");
  }
  const raw: Record<string, unknown> = {};
  for (const field of CATALOG_FIELDS) {
    raw[field] = readValue(candidate, field);
  }
  return raw;
}

function snapshotScanReceipt(candidate: TrustedExtensionScanReceipt): Record<string, unknown> {
  if (candidate === null || typeof candidate !== "object") {
    return reject("scan receipt must be an object");
  }
  const raw: Record<string, unknown> = {};
  for (const field of RECEIPT_FIELDS) {
    raw[field] = readValue(candidate, field);
  }
  return raw;
}

function validateCatalogEntry(
  candidate: TrustedExtensionCatalogEntry,
): TrustedExtensionCatalogEntry {
  const raw = snapshotCatalog(candidate);
  return Object.freeze({
    external_extension_id: requirePattern(
      raw.external_extension_id,
      TWO_WORD_SNAKE_PATTERN,
      "external_extension_id",
    ),
    upstream_repository: requirePattern(
      raw.upstream_repository,
      REPOSITORY_PATTERN,
      "upstream_repository",
    ),
    upstream_commit_sha: requirePattern(
      raw.upstream_commit_sha,
      COMMIT_PATTERN,
      "upstream_commit_sha",
    ),
    upstream_path: requireRelativePath(raw.upstream_path, "upstream_path"),
    artifact_sha256: requirePattern(raw.artifact_sha256, SHA256_PATTERN, "artifact_sha256"),
    marketplace_entry_sha256: requirePattern(
      raw.marketplace_entry_sha256,
      SHA256_PATTERN,
      "marketplace_entry_sha256",
    ),
  });
}

function validateScanReceipt(candidate: TrustedExtensionScanReceipt): TrustedExtensionScanReceipt {
  const raw = snapshotScanReceipt(candidate);
  const producer = raw.producer;
  if (producer !== "appguardrail" && producer !== "quarantine-sandbox-runtime") {
    reject("scan receipt producer is not trusted");
  }
  return Object.freeze({
    receipt_id: requirePattern(raw.receipt_id, RECEIPT_ID_PATTERN, "receipt_id"),
    artifact_sha256: requirePattern(raw.artifact_sha256, SHA256_PATTERN, "artifact_sha256"),
    policy_version: requirePattern(raw.policy_version, REFERENCE_PATTERN, "policy_version"),
    producer,
  });
}

function validateDescriptor(candidate: ExternalExtensionDescriptor): ExternalExtensionDescriptor {
  const raw = snapshotDescriptor(candidate);
  const adoptionMode = requireExactString(
    raw.adoption_mode,
    "developer_assist",
    "adoption_mode",
  ) as ExternalExtensionAdoptionMode;
  const approvalStatus = raw.approval_status;
  if (
    typeof approvalStatus !== "string" ||
    !EXTERNAL_EXTENSION_ADMISSION_STATES.includes(
      approvalStatus as ExternalExtensionAdmissionState,
    )
  ) {
    reject("approval_status is not a reviewed admission state");
  }
  const validFrom = requireTimestamp(raw.valid_from, "valid_from");
  const validTo = requireTimestamp(raw.valid_to, "valid_to");
  if (Date.parse(validTo) <= Date.parse(validFrom)) {
    reject("valid_to must be later than valid_from");
  }

  return Object.freeze({
    external_extension_id: requirePattern(
      raw.external_extension_id,
      TWO_WORD_SNAKE_PATTERN,
      "external_extension_id",
    ),
    capability_code: requirePattern(raw.capability_code, TWO_WORD_SNAKE_PATTERN, "capability_code"),
    adoption_mode: adoptionMode,
    upstream_repository: requirePattern(
      raw.upstream_repository,
      REPOSITORY_PATTERN,
      "upstream_repository",
    ),
    upstream_commit_sha: requirePattern(
      raw.upstream_commit_sha,
      COMMIT_PATTERN,
      "upstream_commit_sha",
    ),
    upstream_path: requireRelativePath(raw.upstream_path, "upstream_path"),
    artifact_sha256: requirePattern(raw.artifact_sha256, SHA256_PATTERN, "artifact_sha256"),
    marketplace_entry_sha256: requirePattern(
      raw.marketplace_entry_sha256,
      SHA256_PATTERN,
      "marketplace_entry_sha256",
    ),
    plugin_name: requirePattern(raw.plugin_name, PLUGIN_NAME_PATTERN, "plugin_name"),
    plugin_version: requirePattern(raw.plugin_version, SEMVER_PATTERN, "plugin_version"),
    license_expression: requirePattern(raw.license_expression, LICENSE_PATTERN, "license_expression"),
    license_evidence_reference: requirePattern(
      raw.license_evidence_reference,
      REFERENCE_PATTERN,
      "license_evidence_reference",
    ),
    input_schema_reference: requirePattern(
      raw.input_schema_reference,
      REFERENCE_PATTERN,
      "input_schema_reference",
    ),
    output_schema_reference: requirePattern(
      raw.output_schema_reference,
      REFERENCE_PATTERN,
      "output_schema_reference",
    ),
    required_filesystem_capabilities: requireEmptyCapabilityList(
      raw.required_filesystem_capabilities,
      "required_filesystem_capabilities",
    ),
    required_network_capabilities: requireEmptyCapabilityList(
      raw.required_network_capabilities,
      "required_network_capabilities",
    ),
    required_process_capabilities: requireEmptyCapabilityList(
      raw.required_process_capabilities,
      "required_process_capabilities",
    ),
    required_secret_handles: requireEmptyCapabilityList(
      raw.required_secret_handles,
      "required_secret_handles",
    ),
    required_mcp_servers: requireEmptyCapabilityList(
      raw.required_mcp_servers,
      "required_mcp_servers",
    ),
    allowed_product_repositories: requireStringList(
      raw.allowed_product_repositories,
      "allowed_product_repositories",
    ),
    allowed_execution_roles: requireStringList(
      raw.allowed_execution_roles,
      "allowed_execution_roles",
    ),
    isolation_profile_reference: requirePattern(
      raw.isolation_profile_reference,
      REFERENCE_PATTERN,
      "isolation_profile_reference",
    ),
    egress_policy_reference: requirePattern(
      raw.egress_policy_reference,
      REFERENCE_PATTERN,
      "egress_policy_reference",
    ),
    appguardrail_scan_receipt: requirePattern(
      raw.appguardrail_scan_receipt,
      RECEIPT_ID_PATTERN,
      "appguardrail_scan_receipt",
    ),
    quarantine_analysis_receipt: requirePattern(
      raw.quarantine_analysis_receipt,
      RECEIPT_ID_PATTERN,
      "quarantine_analysis_receipt",
    ),
    approval_status: approvalStatus as ExternalExtensionAdmissionState,
    valid_from: validFrom,
    valid_to: validTo,
    supersedes_extension_id: optionalIdentifier(
      raw.supersedes_extension_id,
      "supersedes_extension_id",
    ),
    rollback_reference: optionalReference(raw.rollback_reference, "rollback_reference"),
  });
}

function requireCatalogMatch(
  descriptor: ExternalExtensionDescriptor,
  catalog: TrustedExtensionCatalogEntry,
): void {
  if (catalog.external_extension_id !== descriptor.external_extension_id) {
    reject("trusted catalog does not match external_extension_id");
  }
  if (catalog.upstream_repository !== descriptor.upstream_repository) {
    reject("trusted catalog does not match upstream_repository");
  }
  if (catalog.upstream_commit_sha !== descriptor.upstream_commit_sha) {
    reject("trusted catalog does not match upstream_commit_sha");
  }
  if (catalog.upstream_path !== descriptor.upstream_path) {
    reject("trusted catalog does not match upstream_path");
  }
  if (catalog.artifact_sha256 !== descriptor.artifact_sha256) {
    reject("trusted catalog does not match artifact_sha256");
  }
  if (catalog.marketplace_entry_sha256 !== descriptor.marketplace_entry_sha256) {
    reject("trusted catalog does not match marketplace_entry_sha256");
  }
}

function sameCatalog(
  left: TrustedExtensionCatalogEntry,
  right: TrustedExtensionCatalogEntry,
): boolean {
  return (
    left.external_extension_id === right.external_extension_id &&
    left.upstream_repository === right.upstream_repository &&
    left.upstream_commit_sha === right.upstream_commit_sha &&
    left.upstream_path === right.upstream_path &&
    left.artifact_sha256 === right.artifact_sha256 &&
    left.marketplace_entry_sha256 === right.marketplace_entry_sha256
  );
}

function requireReceiptMatch(
  receipt: TrustedExtensionScanReceipt,
  descriptor: ExternalExtensionDescriptor,
  expectedProducer: TrustedExtensionScanReceipt["producer"],
  expectedPolicy: string,
): void {
  if (receipt.producer !== expectedProducer) {
    reject("scan receipt producer does not match the required owner");
  }
  if (receipt.artifact_sha256 !== descriptor.artifact_sha256) {
    reject("scan receipt artifact does not match the extension");
  }
  if (receipt.policy_version !== expectedPolicy) {
    reject("scan receipt policy does not match the extension");
  }
}

function resolveCatalog(
  authority: ExternalExtensionAuthority,
  extensionId: string,
): TrustedExtensionCatalogEntry {
  let catalog: TrustedExtensionCatalogEntry | null;
  try {
    catalog = authority.resolveCatalog(extensionId);
  } catch {
    return reject("trusted catalog lookup failed");
  }
  if (!catalog) reject("trusted catalog did not recognize extension");
  return validateCatalogEntry(catalog);
}

function resolveReceipt(
  authority: ExternalExtensionAuthority,
  receiptId: string,
): TrustedExtensionScanReceipt {
  let receipt: TrustedExtensionScanReceipt | null;
  try {
    receipt = authority.resolveScanReceipt(receiptId);
  } catch {
    return reject("trusted scan receipt lookup failed");
  }
  if (!receipt) reject("trusted scan receipt is missing");
  return validateScanReceipt(receipt);
}

/**
 * Immutable in-process catalog and scan-receipt registry.
 *
 * Pins are populated only from an operator-controlled trust anchor. The adapter
 * never discovers the Anthropic marketplace, copies plugin source, or treats
 * self-asserted scan success as admission authority.
 */
export class PinnedExternalExtensionAuthority implements ExternalExtensionAuthority {
  private readonly catalog: ReadonlyMap<string, TrustedExtensionCatalogEntry>;
  private readonly receipts: ReadonlyMap<string, TrustedExtensionScanReceipt>;

  constructor(
    catalog: readonly TrustedExtensionCatalogEntry[],
    receipts: readonly TrustedExtensionScanReceipt[],
  ) {
    const catalogPins = new Map<string, TrustedExtensionCatalogEntry>();
    for (const entry of catalog) {
      const validated = validateCatalogEntry(entry);
      if (catalogPins.has(validated.external_extension_id)) {
        reject("trusted catalog contains a duplicate extension pin");
      }
      catalogPins.set(validated.external_extension_id, validated);
    }
    const receiptPins = new Map<string, TrustedExtensionScanReceipt>();
    for (const receipt of receipts) {
      const validated = validateScanReceipt(receipt);
      if (receiptPins.has(validated.receipt_id)) {
        reject("trusted scan receipts contain a duplicate receipt pin");
      }
      receiptPins.set(validated.receipt_id, validated);
    }
    this.catalog = catalogPins;
    this.receipts = receiptPins;
  }

  resolveCatalog(extensionId: string): TrustedExtensionCatalogEntry | null {
    return this.catalog.get(extensionId) ?? null;
  }

  resolveScanReceipt(receiptId: string): TrustedExtensionScanReceipt | null {
    return this.receipts.get(receiptId) ?? null;
  }
}

function admitBoundary(
  candidate: ExternalExtensionDescriptor,
  authority?: ExternalExtensionAuthority,
): AdmittedExternalExtension {
  const descriptor = validateDescriptor(candidate);
  if (!authority) {
    return reject("trusted extension authority is required before admission");
  }
  const catalog = resolveCatalog(authority, descriptor.external_extension_id);
  requireCatalogMatch(descriptor, catalog);
  const appguardrail = resolveReceipt(authority, descriptor.appguardrail_scan_receipt);
  requireReceiptMatch(
    appguardrail,
    descriptor,
    "appguardrail",
    descriptor.isolation_profile_reference,
  );
  const quarantine = resolveReceipt(authority, descriptor.quarantine_analysis_receipt);
  requireReceiptMatch(
    quarantine,
    descriptor,
    "quarantine-sandbox-runtime",
    descriptor.isolation_profile_reference,
  );
  return Object.freeze({ descriptor, catalog });
}

/**
 * Admit one external Claude-plugin descriptor after catalog and scan pins match.
 *
 * Marketplace metadata, Anthropic review, mutable branches/tags, local paths,
 * and plugin instructions are not admission authority. The local port is a
 * test double until `context-graph-contracts` publishes an immutable shared
 * artifact contract.
 *
 * @param candidate Untrusted descriptor supplied at the Tool / Capability boundary.
 * @param authority Independently populated catalog and scan-receipt pins.
 * @returns Frozen admitted descriptor and matching catalog identity.
 */
export function admitExternalExtension(
  candidate: ExternalExtensionDescriptor,
  authority?: ExternalExtensionAuthority,
): AdmittedExternalExtension {
  return admitBoundary(candidate, authority);
}

function snapshotActivation(activation: ExternalExtensionActivation): ExternalExtensionActivation {
  return Object.freeze({
    activation_id: activation.activation_id,
    external_extension_id: activation.external_extension_id,
    product_repository: activation.product_repository,
    execution_role: activation.execution_role,
    execution_mode: activation.execution_mode,
    policy_version: activation.policy_version,
    artifact_sha256: activation.artifact_sha256,
    activated_at: activation.activated_at,
  });
}

function sameActivation(
  left: ExternalExtensionActivation,
  right: ExternalExtensionActivation,
): boolean {
  return (
    left.activation_id === right.activation_id &&
    left.external_extension_id === right.external_extension_id &&
    left.product_repository === right.product_repository &&
    left.execution_role === right.execution_role &&
    left.execution_mode === right.execution_mode &&
    left.policy_version === right.policy_version &&
    left.artifact_sha256 === right.artifact_sha256 &&
    left.activated_at === right.activated_at
  );
}

function activateBoundary(
  admitted: AdmittedExternalExtension,
  request: {
    activation_id: string;
    product_repository: string;
    execution_role: string;
    execution_mode: ExternalExtensionExecutionMode;
    policy_version: string;
    activated_at: string;
  },
  retained: ExternalExtensionActivation | null,
): ExternalExtensionActivationAdmission {
  const descriptor = admitted.descriptor;
  const activationId = requirePattern(request.activation_id, RECEIPT_ID_PATTERN, "activation_id");
  const productRepository = requirePattern(
    request.product_repository,
    REPOSITORY_PATTERN,
    "product_repository",
  );
  const executionRole = requirePattern(
    request.execution_role,
    TWO_WORD_SNAKE_PATTERN,
    "execution_role",
  );
  if (request.execution_mode === "product_runtime") {
    reject("product-runtime mode cannot execute a Claude plugin wrapper");
  }
  if (request.execution_mode !== "developer_assist") {
    reject("execution_mode is not a reviewed activation mode");
  }
  const policyVersion = requirePattern(request.policy_version, REFERENCE_PATTERN, "policy_version");
  const activatedAt = requireTimestamp(request.activated_at, "activated_at");
  if (
    descriptor.approval_status !== "approved_for_pilot" &&
    descriptor.approval_status !== "active"
  ) {
    reject("extension is not approved for product-scoped activation");
  }
  if (!descriptor.allowed_product_repositories.includes(productRepository)) {
    reject("activation product is outside the approved repository scope");
  }
  if (!descriptor.allowed_execution_roles.includes(executionRole)) {
    reject("activation role is outside the approved execution roles");
  }
  if (Date.parse(activatedAt) < Date.parse(descriptor.valid_from)) {
    reject("activation is before the approved validity window");
  }
  if (Date.parse(activatedAt) >= Date.parse(descriptor.valid_to)) {
    reject("activation is outside the approved validity window");
  }
  const activation = snapshotActivation({
    activation_id: activationId,
    external_extension_id: descriptor.external_extension_id,
    product_repository: productRepository,
    execution_role: executionRole,
    execution_mode: "developer_assist",
    policy_version: policyVersion,
    artifact_sha256: descriptor.artifact_sha256,
    activated_at: activatedAt,
  });
  if (retained !== null) {
    const retainedSnapshot = snapshotActivation(retained);
    if (sameActivation(retainedSnapshot, activation)) {
      return Object.freeze({ kind: "replay" as const, activation: retainedSnapshot });
    }
    reject("activation event conflicts with the retained activation");
  }
  return Object.freeze({ kind: "accepted" as const, activation });
}

/**
 * Activate an admitted extension for one product repository and execution role.
 *
 * `approved_for_pilot` is not runtime invocation authority. A second identical
 * activation event is an idempotent replay; any other retained activation is a
 * conflict.
 *
 * @param admitted Frozen admission snapshot from `admitExternalExtension`.
 * @param request Product-scoped activation identity and time.
 * @param retained Previously admitted activation for this extension, if any.
 * @returns Accepted or replayed frozen activation.
 */
export function activateExternalExtension(
  admitted: AdmittedExternalExtension,
  request: {
    activation_id: string;
    product_repository: string;
    execution_role: string;
    execution_mode: ExternalExtensionExecutionMode;
    policy_version: string;
    activated_at: string;
  },
  retained: ExternalExtensionActivation | null = null,
): ExternalExtensionActivationAdmission {
  try {
    return activateBoundary(admitted, request, retained);
  } catch (error) {
    if (error instanceof ExternalExtensionAdmissionError) throw error;
    throw new ExternalExtensionAdmissionError("activation request could not be read safely");
  }
}

function snapshotReceipt(
  receipt: ExternalExtensionInvocationReceipt,
): ExternalExtensionInvocationReceipt {
  return Object.freeze({
    receipt_id: receipt.receipt_id,
    external_extension_id: receipt.external_extension_id,
    capability_code: receipt.capability_code,
    artifact_sha256: receipt.artifact_sha256,
    product_repository: receipt.product_repository,
    invoked_at: receipt.invoked_at,
  });
}

function sameReceipt(
  left: ExternalExtensionInvocationReceipt,
  right: ExternalExtensionInvocationReceipt,
): boolean {
  return (
    left.receipt_id === right.receipt_id &&
    left.external_extension_id === right.external_extension_id &&
    left.capability_code === right.capability_code &&
    left.artifact_sha256 === right.artifact_sha256 &&
    left.product_repository === right.product_repository &&
    left.invoked_at === right.invoked_at
  );
}

function invokeBoundary(
  admitted: AdmittedExternalExtension,
  activation: ExternalExtensionActivation,
  request: ExternalExtensionInvocationRequest,
  authority: ExternalExtensionAuthority,
  retained: ExternalExtensionInvocationReceipt | null,
): ExternalExtensionInvocationAdmission {
  const descriptor = admitted.descriptor;
  const activationSnapshot = snapshotActivation(activation);
  if (activationSnapshot.external_extension_id !== descriptor.external_extension_id) {
    reject("activation does not belong to the admitted extension");
  }
  if (activationSnapshot.artifact_sha256 !== descriptor.artifact_sha256) {
    reject("activation artifact does not match the admitted extension");
  }
  const revalidatedActivation = activateBoundary(
    admitted,
    {
      activation_id: activationSnapshot.activation_id,
      product_repository: activationSnapshot.product_repository,
      execution_role: activationSnapshot.execution_role,
      execution_mode: activationSnapshot.execution_mode,
      policy_version: activationSnapshot.policy_version,
      activated_at: activationSnapshot.activated_at,
    },
    null,
  ).activation;
  if (!sameActivation(activationSnapshot, revalidatedActivation)) {
    reject("activation does not match the admitted product-scoped authority");
  }
  if (request.execution_mode === "product_runtime") {
    reject("product-runtime mode cannot execute a Claude plugin wrapper");
  }
  if (request.execution_mode !== "developer_assist") {
    reject("execution_mode is not a reviewed invocation mode");
  }
  if (descriptor.approval_status !== "active") {
    reject("only an active extension may be invoked");
  }
  if (descriptor.rollback_reference !== "") {
    reject("rollback-marked extension cannot be invoked");
  }
  const invokedAt = requireTimestamp(request.invoked_at, "invoked_at");
  if (Date.parse(invokedAt) < Date.parse(descriptor.valid_from)) {
    reject("invocation is before the approved validity window");
  }
  if (Date.parse(invokedAt) >= Date.parse(descriptor.valid_to)) {
    reject("expired extension cannot be invoked");
  }
  const invocationId = requirePattern(request.invocation_id, RECEIPT_ID_PATTERN, "invocation_id");
  requirePattern(request.activation_id, RECEIPT_ID_PATTERN, "activation_id");
  if (request.activation_id !== activationSnapshot.activation_id) {
    reject("invocation activation_id does not match the retained activation");
  }
  if (typeof request.instruction !== "string" || request.instruction.trim() === "") {
    reject("instruction must be non-empty text");
  }
  if (typeof request.observed_content !== "string") {
    reject("observed_content must be a string");
  }
  if (typeof request.promote_observed_content !== "boolean") {
    reject("promote_observed_content must be a boolean");
  }
  if (request.promote_observed_content) {
    reject("plugin instruction cannot promote observed content into trusted policy");
  }
  if (
    request.observed_content !== "" &&
    request.instruction.includes(request.observed_content) &&
    POLICY_PROMOTION_PATTERN.test(request.instruction)
  ) {
    reject("plugin instruction cannot promote observed content into trusted policy");
  }
  if (POLICY_PROMOTION_PATTERN.test(request.instruction)) {
    reject("plugin instruction cannot promote observed content into trusted policy");
  }
  if (typeof request.secret_material !== "string") reject("secret_material must be a string");
  if (typeof request.product_record !== "string") reject("product_record must be a string");
  if (typeof request.hidden_reasoning !== "string") reject("hidden_reasoning must be a string");
  if (request.secret_material !== "" || SECRET_LEAK_PATTERN.test(request.instruction)) {
    reject("invocation receipts cannot contain secrets");
  }
  if (request.product_record !== "") {
    reject("invocation receipts cannot contain raw product data");
  }
  if (request.hidden_reasoning !== "") {
    reject("invocation receipts cannot contain hidden reasoning");
  }
  const liveCatalog = resolveCatalog(authority, descriptor.external_extension_id);
  if (!sameCatalog(liveCatalog, admitted.catalog)) {
    reject("catalog drift cannot update an admitted extension");
  }
  const receipt = snapshotReceipt({
    receipt_id: invocationId,
    external_extension_id: descriptor.external_extension_id,
    capability_code: descriptor.capability_code,
    artifact_sha256: descriptor.artifact_sha256,
    product_repository: activationSnapshot.product_repository,
    invoked_at: invokedAt,
  });
  if (retained !== null) {
    const retainedSnapshot = snapshotReceipt(retained);
    if (sameReceipt(retainedSnapshot, receipt)) {
      return Object.freeze({ kind: "replay" as const, receipt: retainedSnapshot });
    }
    reject("invocation event conflicts with the retained receipt");
  }
  return Object.freeze({ kind: "accepted" as const, receipt });
}

/**
 * Invoke an active, in-window, non-rolled-back activation and emit a bounded receipt.
 *
 * Product-runtime Claude plugin wrappers, observed-content promotion, catalog
 * drift, expired/suspended activations, and secret/product/reasoning payloads
 * fail closed. Duplicate invocation identity is an idempotent replay.
 *
 * @param admitted Frozen admission snapshot.
 * @param activation Frozen product-scoped activation.
 * @param request Untrusted invocation envelope.
 * @param authority Live catalog authority used to detect source drift.
 * @param retained Previously emitted receipt for this invocation identity, if any.
 * @returns Accepted or replayed frozen invocation receipt.
 */
export function invokeExternalExtension(
  admitted: AdmittedExternalExtension,
  activation: ExternalExtensionActivation,
  request: ExternalExtensionInvocationRequest,
  authority: ExternalExtensionAuthority,
  retained: ExternalExtensionInvocationReceipt | null = null,
): ExternalExtensionInvocationAdmission {
  try {
    return invokeBoundary(admitted, activation, request, authority, retained);
  } catch (error) {
    if (error instanceof ExternalExtensionAdmissionError) throw error;
    throw new ExternalExtensionAdmissionError("invocation request could not be read safely");
  }
}
