import {
  EXTERNAL_EXTENSION_ADMISSION_STATES,
  ExternalExtensionAdmissionError,
  PinnedExternalExtensionAuthority as CorePinnedExternalExtensionAuthority,
  activateExternalExtension as coreActivateExternalExtension,
  admitExternalExtension as coreAdmitExternalExtension,
  invokeExternalExtension as coreInvokeExternalExtension,
  type AdmittedExternalExtension,
  type ExternalExtensionActivation,
  type ExternalExtensionActivationAdmission,
  type ExternalExtensionAdmissionState,
  type ExternalExtensionAuthority as CoreExternalExtensionAuthority,
  type ExternalExtensionDescriptor,
  type ExternalExtensionInvocationAdmission,
  type ExternalExtensionInvocationRequest,
  type ExternalExtensionInvocationReceipt,
  type TrustedExtensionCatalogEntry,
  type TrustedExtensionScanReceipt as CoreTrustedExtensionScanReceipt,
} from "./internal/external-extension-admission-core";
import { digestExternalExtensionInvocationEnvelope } from "./internal/external-extension-invocation-digest";

export { EXTERNAL_EXTENSION_ADMISSION_STATES, ExternalExtensionAdmissionError };
export type {
  AdmittedExternalExtension,
  ExternalExtensionActivation,
  ExternalExtensionActivationAdmission,
  ExternalExtensionAdmissionState,
  ExternalExtensionAdoptionMode,
  ExternalExtensionDescriptor,
  ExternalExtensionExecutionMode,
  ExternalExtensionInvocationAdmission,
  ExternalExtensionInvocationRequest,
  ExternalExtensionInvocationReceipt,
  TrustedExtensionCatalogEntry,
} from "./internal/external-extension-admission-core";

/**
 * Trusted evidence receipt exposed at Noema's owner boundary.
 *
 * `policy_version` is the local isolation-envelope reference consumed by the internal
 * admission core. The producing owner's actual policy/profile identity is carried
 * separately as `policy_profile_id` plus the exact policy/profile byte digest. This
 * prevents AppGuardrail scan-policy authority from being collapsed into quarantine
 * isolation-profile authority.
 */
export interface TrustedExtensionScanReceipt extends CoreTrustedExtensionScanReceipt {
  policy_profile_id: string;
  policy_profile_sha256: string;
}

/**
 * Immutable Noema Policy / Approval evidence that bounds one extension's lifecycle,
 * product repositories, execution roles, validity window, isolation, egress, activation
 * policy, and exact independently owned AppGuardrail/quarantine evidence profiles.
 */
export interface TrustedExtensionPolicyApproval {
  external_extension_id: string;
  max_approval_status: "approved_for_pilot" | "active";
  allowed_product_repositories: readonly string[];
  allowed_execution_roles: readonly string[];
  valid_from: string;
  valid_to: string;
  isolation_profile_reference: string;
  egress_policy_reference: string;
  activation_policy_version: string;
  appguardrail_policy_profile_id: string;
  appguardrail_policy_profile_sha256: string;
  quarantine_policy_profile_id: string;
  quarantine_policy_profile_sha256: string;
}

/** Composite trust port for independently owned catalog, scan, and Noema policy evidence. */
export interface ExternalExtensionAuthority extends CoreExternalExtensionAuthority {
  resolveScanReceipt(receiptId: string): TrustedExtensionScanReceipt | null;
  resolvePolicyApproval?(extensionId: string): TrustedExtensionPolicyApproval | null;
}

const POLICY_REFERENCE_PATTERN = /^urn:cwl:[a-z0-9][a-z0-9._:-]{3,253}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

const BOUND_POLICY_APPROVALS = new WeakMap<
  AdmittedExternalExtension,
  Readonly<{
    approval: Readonly<TrustedExtensionPolicyApproval>;
    authority: ExternalExtensionAuthority;
  }>
>();
const BOUND_INVOCATION_REQUESTS = new WeakMap<ExternalExtensionInvocationReceipt, string>();

function rejectPolicy(message: string): never {
  throw new ExternalExtensionAdmissionError(message);
}

function freezePolicyApproval(
  candidate: TrustedExtensionPolicyApproval,
): Readonly<TrustedExtensionPolicyApproval> {
  if (candidate === null || typeof candidate !== "object") {
    return rejectPolicy("trusted policy approval is malformed");
  }

  let snapshot: TrustedExtensionPolicyApproval;
  try {
    const allowedProductRepositories = candidate.allowed_product_repositories;
    const allowedExecutionRoles = candidate.allowed_execution_roles;
    if (!Array.isArray(allowedProductRepositories) || !Array.isArray(allowedExecutionRoles)) {
      return rejectPolicy("trusted policy approval scope is malformed");
    }
    snapshot = {
      external_extension_id: candidate.external_extension_id,
      max_approval_status: candidate.max_approval_status,
      allowed_product_repositories: Object.freeze([...allowedProductRepositories]),
      allowed_execution_roles: Object.freeze([...allowedExecutionRoles]),
      valid_from: candidate.valid_from,
      valid_to: candidate.valid_to,
      isolation_profile_reference: candidate.isolation_profile_reference,
      egress_policy_reference: candidate.egress_policy_reference,
      activation_policy_version: candidate.activation_policy_version,
      appguardrail_policy_profile_id: candidate.appguardrail_policy_profile_id,
      appguardrail_policy_profile_sha256: candidate.appguardrail_policy_profile_sha256,
      quarantine_policy_profile_id: candidate.quarantine_policy_profile_id,
      quarantine_policy_profile_sha256: candidate.quarantine_policy_profile_sha256,
    };
  } catch (error) {
    if (error instanceof ExternalExtensionAdmissionError) throw error;
    return rejectPolicy("trusted policy approval could not be read safely");
  }

  const scalarFields = [
    snapshot.external_extension_id,
    snapshot.max_approval_status,
    snapshot.valid_from,
    snapshot.valid_to,
    snapshot.isolation_profile_reference,
    snapshot.egress_policy_reference,
    snapshot.activation_policy_version,
    snapshot.appguardrail_policy_profile_id,
    snapshot.appguardrail_policy_profile_sha256,
    snapshot.quarantine_policy_profile_id,
    snapshot.quarantine_policy_profile_sha256,
  ];
  const scalarShapeValid = scalarFields.every((value) => typeof value === "string");
  const scopeShapeValid = [
    ...snapshot.allowed_product_repositories,
    ...snapshot.allowed_execution_roles,
  ].every((value) => typeof value === "string");
  const statusValid =
    snapshot.max_approval_status === "approved_for_pilot" || snapshot.max_approval_status === "active";
  const policyReferencesValid = [
    snapshot.activation_policy_version,
    snapshot.appguardrail_policy_profile_id,
    snapshot.quarantine_policy_profile_id,
  ].every((value) => typeof value === "string" && POLICY_REFERENCE_PATTERN.test(value));
  const profileDigestsValid = [
    snapshot.appguardrail_policy_profile_sha256,
    snapshot.quarantine_policy_profile_sha256,
  ].every((value) => typeof value === "string" && SHA256_PATTERN.test(value));
  if (
    [
      scalarShapeValid,
      scopeShapeValid,
      statusValid,
      policyReferencesValid,
      profileDigestsValid,
    ].includes(false)
  ) {
    return rejectPolicy("trusted policy approval fields are malformed");
  }
  return Object.freeze(snapshot);
}

function resolvePolicyApproval(
  authority: ExternalExtensionAuthority,
  extensionId: string,
): Readonly<TrustedExtensionPolicyApproval> {
  let candidate: TrustedExtensionPolicyApproval | null = null;
  try {
    const resolver = authority.resolvePolicyApproval;
    if (resolver !== undefined) {
      candidate = resolver.call(authority, extensionId);
    }
  } catch {
    return rejectPolicy("trusted policy approval lookup failed");
  }
  if (candidate === null) {
    return rejectPolicy("policy approval authority is required before admission");
  }
  return freezePolicyApproval(candidate);
}

function statusWithinApproval(
  descriptorStatus: ExternalExtensionAdmissionState,
  maximumStatus: TrustedExtensionPolicyApproval["max_approval_status"],
): boolean {
  if (descriptorStatus === "active") return maximumStatus === "active";
  if (descriptorStatus === "approved_for_pilot") {
    return maximumStatus === "active" || maximumStatus === "approved_for_pilot";
  }
  return true;
}
function isSubset(requested: readonly string[], allowed: readonly string[]): boolean {
  return requested.every((item) => allowed.includes(item));
}

function requirePolicyMatch(
  descriptor: Readonly<ExternalExtensionDescriptor>,
  approval: Readonly<TrustedExtensionPolicyApproval>,
): void {
  const checks = [
    descriptor.external_extension_id === approval.external_extension_id,
    statusWithinApproval(descriptor.approval_status, approval.max_approval_status),
    isSubset(descriptor.allowed_product_repositories, approval.allowed_product_repositories),
    isSubset(descriptor.allowed_execution_roles, approval.allowed_execution_roles),
    Date.parse(descriptor.valid_from) >= Date.parse(approval.valid_from),
    Date.parse(descriptor.valid_to) <= Date.parse(approval.valid_to),
    descriptor.isolation_profile_reference === approval.isolation_profile_reference,
    descriptor.egress_policy_reference === approval.egress_policy_reference,
  ];
  if (checks.includes(false)) {
    rejectPolicy("policy approval authority is required before admission");
  }
}

function snapshotOwnerEvidenceReceipt(
  candidate: TrustedExtensionScanReceipt,
): Readonly<TrustedExtensionScanReceipt> {
  if (candidate === null || typeof candidate !== "object") {
    return rejectPolicy("scan receipt must be an object");
  }
  try {
    const receiptId = candidate.receipt_id;
    const artifactSha256 = candidate.artifact_sha256;
    const policyVersion = candidate.policy_version;
    const producer = candidate.producer;
    const policyProfileId = candidate.policy_profile_id;
    const policyProfileSha256 = candidate.policy_profile_sha256;
    if (
      typeof receiptId !== "string" ||
      typeof artifactSha256 !== "string" ||
      typeof policyVersion !== "string" ||
      (producer !== "appguardrail" && producer !== "quarantine-sandbox-runtime") ||
      typeof policyProfileId !== "string" ||
      !POLICY_REFERENCE_PATTERN.test(policyProfileId) ||
      typeof policyProfileSha256 !== "string" ||
      !SHA256_PATTERN.test(policyProfileSha256)
    ) {
      return rejectPolicy("scan receipt owner policy evidence is malformed");
    }
    return Object.freeze({
      receipt_id: receiptId,
      artifact_sha256: artifactSha256,
      policy_version: policyVersion,
      producer,
      policy_profile_id: policyProfileId,
      policy_profile_sha256: policyProfileSha256,
    });
  } catch (error) {
    if (error instanceof ExternalExtensionAdmissionError) throw error;
    return rejectPolicy("scan receipt owner policy evidence could not be read safely");
  }
}

function requireOwnerEvidenceMatch(
  descriptor: Readonly<ExternalExtensionDescriptor>,
  approval: Readonly<TrustedExtensionPolicyApproval>,
  authority: ExternalExtensionAuthority,
): void {
  const checks: ReadonlyArray<{
    receiptId: string;
    producer: TrustedExtensionScanReceipt["producer"];
    policyProfileId: string;
    policyProfileSha256: string;
  }> = [
    {
      receiptId: descriptor.appguardrail_scan_receipt,
      producer: "appguardrail",
      policyProfileId: approval.appguardrail_policy_profile_id,
      policyProfileSha256: approval.appguardrail_policy_profile_sha256,
    },
    {
      receiptId: descriptor.quarantine_analysis_receipt,
      producer: "quarantine-sandbox-runtime",
      policyProfileId: approval.quarantine_policy_profile_id,
      policyProfileSha256: approval.quarantine_policy_profile_sha256,
    },
  ];

  for (const expected of checks) {
    let candidate: TrustedExtensionScanReceipt | null;
    try {
      candidate = authority.resolveScanReceipt(expected.receiptId);
    } catch {
      return rejectPolicy("trusted scan receipt lookup failed");
    }
    if (candidate === null) {
      return rejectPolicy("trusted scan receipt is missing");
    }
    const receipt = snapshotOwnerEvidenceReceipt(candidate);
    if (receipt.producer !== expected.producer) {
      return rejectPolicy("scan receipt producer does not match the required owner");
    }
    if (receipt.artifact_sha256 !== descriptor.artifact_sha256) {
      return rejectPolicy("scan receipt artifact does not match the extension");
    }
    if (receipt.policy_version !== descriptor.isolation_profile_reference) {
      return rejectPolicy("scan receipt isolation envelope does not match the extension");
    }
    if (
      receipt.policy_profile_id !== expected.policyProfileId ||
      receipt.policy_profile_sha256 !== expected.policyProfileSha256
    ) {
      return rejectPolicy("scan receipt policy does not match the required owner profile");
    }
  }
}

function requireRuntimeWindow(
  descriptor: Readonly<ExternalExtensionDescriptor>,
  approval: Readonly<TrustedExtensionPolicyApproval>,
): number {
  const runtimeNow = Date.now();
  const validFrom = Math.max(Date.parse(descriptor.valid_from), Date.parse(approval.valid_from));
  const validTo = Math.min(Date.parse(descriptor.valid_to), Date.parse(approval.valid_to));
  if (runtimeNow < validFrom || runtimeNow >= validTo) {
    rejectPolicy("runtime clock is outside the approved validity window");
  }
  return runtimeNow;
}

function requireEventNotFuture(timestamp: string, runtimeNow: number, eventName: string): void {
  if (Date.parse(timestamp) > runtimeNow) {
    rejectPolicy(`${eventName} time cannot be in the future`);
  }
}

function policyFingerprint(approval: Readonly<TrustedExtensionPolicyApproval>): string {
  return JSON.stringify(approval);
}

function snapshotActivationRequest(
  request: Parameters<typeof coreActivateExternalExtension>[1],
): Parameters<typeof coreActivateExternalExtension>[1] {
  return Object.freeze({
    activation_id: request.activation_id,
    product_repository: request.product_repository,
    execution_role: request.execution_role,
    execution_mode: request.execution_mode,
    policy_version: request.policy_version,
    activated_at: request.activated_at,
  });
}

function snapshotInvocationRequest(
  request: ExternalExtensionInvocationRequest,
): Readonly<ExternalExtensionInvocationRequest> {
  return Object.freeze({
    activation_id: request.activation_id,
    invocation_id: request.invocation_id,
    execution_mode: request.execution_mode,
    invoked_at: request.invoked_at,
    instruction: request.instruction,
    observed_content: request.observed_content,
    promote_observed_content: request.promote_observed_content,
    secret_material: request.secret_material,
    product_record: request.product_record,
    hidden_reasoning: request.hidden_reasoning,
  });
}

function requireBoundPolicyApproval(
  admitted: AdmittedExternalExtension,
): Readonly<{
  approval: Readonly<TrustedExtensionPolicyApproval>;
  authority: ExternalExtensionAuthority;
}> {
  const binding = BOUND_POLICY_APPROVALS.get(admitted);
  if (binding === undefined) {
    return rejectPolicy(
      "admission authority is not trusted: Noema policy approval binding is missing",
    );
  }
  return binding;
}

/**
 * Operator-pinned authority that resolves immutable catalog, scanner, and Noema Policy / Approval
 * evidence without trusting extension-supplied metadata. Policy / Approval evidence is explicit:
 * constructor callers must supply immutable owner-profile digests rather than inheriting source
 * placeholders or mutable foreign-owner state.
 */
export class PinnedExternalExtensionAuthority
  extends CorePinnedExternalExtensionAuthority
  implements ExternalExtensionAuthority
{
  private readonly policyApprovals: ReadonlyMap<string, Readonly<TrustedExtensionPolicyApproval>>;
  private readonly ownerEvidenceReceipts: ReadonlyMap<
    string,
    Readonly<TrustedExtensionScanReceipt>
  >;

  constructor(
    catalog: readonly TrustedExtensionCatalogEntry[],
    receipts: readonly TrustedExtensionScanReceipt[],
    policyApprovals: readonly TrustedExtensionPolicyApproval[] = [],
  ) {
    const ownerEvidencePins = new Map<string, Readonly<TrustedExtensionScanReceipt>>();
    for (const candidate of receipts) {
      const receipt = snapshotOwnerEvidenceReceipt(candidate);
      if (ownerEvidencePins.has(receipt.receipt_id)) {
        rejectPolicy("trusted scan receipts contain a duplicate receipt pin");
      }
      ownerEvidencePins.set(receipt.receipt_id, receipt);
    }
    super(catalog, receipts);
    const pins = new Map<string, Readonly<TrustedExtensionPolicyApproval>>();
    for (const candidate of policyApprovals) {
      const approval = freezePolicyApproval(candidate);
      if (pins.has(approval.external_extension_id)) {
        rejectPolicy("trusted policy approvals contain a duplicate extension pin");
      }
      pins.set(approval.external_extension_id, approval);
    }
    this.policyApprovals = pins;
    this.ownerEvidenceReceipts = ownerEvidencePins;
  }

  override resolveScanReceipt(receiptId: string): TrustedExtensionScanReceipt | null {
    return this.ownerEvidenceReceipts.get(receiptId) ?? null;
  }

  resolvePolicyApproval(extensionId: string): TrustedExtensionPolicyApproval | null {
    return this.policyApprovals.get(extensionId) ?? null;
  }
}

/**
 * Admit one descriptor only after catalog, scan, and independent Policy / Approval validation.
 *
 * @param candidate Untrusted external-extension descriptor to validate and freeze.
 * @param authority Trusted evidence resolver; missing explicit Policy / Approval evidence fails closed.
 * @returns Frozen admission bound to the exact authority and policy snapshot.
 */
export function admitExternalExtension(
  candidate: ExternalExtensionDescriptor,
  authority?: ExternalExtensionAuthority,
): AdmittedExternalExtension {
  try {
    const admitted = coreAdmitExternalExtension(candidate, authority);
    const approval = resolvePolicyApproval(
      authority as ExternalExtensionAuthority,
      admitted.descriptor.external_extension_id,
    );
    requirePolicyMatch(admitted.descriptor, approval);
    requireOwnerEvidenceMatch(admitted.descriptor, approval, authority as ExternalExtensionAuthority);
    BOUND_POLICY_APPROVALS.set(
      admitted,
      Object.freeze({ approval, authority: authority as ExternalExtensionAuthority }),
    );
    return admitted;
  } catch (error) {
    if (error instanceof ExternalExtensionAdmissionError) throw error;
    return rejectPolicy("admission request could not be read safely");
  }
}

/**
 * Activate an admitted extension under its unchanged live policy grant and runtime window.
 *
 * @param admitted Frozen admission previously issued by this module.
 * @param request Untrusted product-scoped activation request.
 * @param retained Prior activation retained for idempotent replay, if any.
 * @returns Accepted or idempotently replayed frozen activation admission.
 */
export function activateExternalExtension(
  admitted: AdmittedExternalExtension,
  request: Parameters<typeof coreActivateExternalExtension>[1],
  retained: ExternalExtensionActivation | null = null,
): ExternalExtensionActivationAdmission {
  try {
    if (admitted === null || typeof admitted !== "object") {
      return coreActivateExternalExtension(admitted, request, retained);
    }
    const normalizedRequest = snapshotActivationRequest(request);
    const binding = requireBoundPolicyApproval(admitted);
    const live = resolvePolicyApproval(
      binding.authority,
      admitted.descriptor.external_extension_id,
    );
    if (policyFingerprint(live) !== policyFingerprint(binding.approval)) {
      return rejectPolicy("policy approval changed or was revoked after admission");
    }
    requireOwnerEvidenceMatch(admitted.descriptor, live, binding.authority);
    if (normalizedRequest.policy_version !== live.activation_policy_version) {
      return rejectPolicy("activation policy_version is not issued by Noema Policy / Approval");
    }
    const runtimeNow = requireRuntimeWindow(admitted.descriptor, live);
    requireEventNotFuture(normalizedRequest.activated_at, runtimeNow, "activation");
    return coreActivateExternalExtension(admitted, normalizedRequest, retained);
  } catch (error) {
    if (error instanceof ExternalExtensionAdmissionError) throw error;
    return rejectPolicy("activation request could not be read safely");
  }
}

/**
 * Invoke an admitted extension under the same live authority that issued admission.
 *
 * Structural, policy, chronology, secret/product-data, and exact-admission checks
 * execute synchronously before any result is published. Replay equality then awaits
 * Workers Web Crypto SHA-256 and publishes only after the digest is available. This
 * keeps cryptographic primitive ownership out of Noema without retaining reversible
 * request JSON or weakening complete mediation.
 *
 * @param admitted Frozen admission snapshot.
 * @param activation Frozen product-scoped activation for this exact admission.
 * @param request Untrusted invocation envelope.
 * @param authority Same live authority object bound at admission.
 * @param retained Previously emitted receipt for idempotent replay, if any.
 * @returns Promise for the accepted or idempotently replayed frozen receipt.
 */
export function invokeExternalExtension(
  admitted: AdmittedExternalExtension,
  activation: ExternalExtensionActivation,
  request: ExternalExtensionInvocationRequest,
  authority: ExternalExtensionAuthority,
  retained: ExternalExtensionInvocationReceipt | null = null,
): Promise<ExternalExtensionInvocationAdmission> {
  try {
    if (admitted === null || typeof admitted !== "object") {
      return Promise.resolve(
        coreInvokeExternalExtension(admitted, activation, request, authority, retained),
      );
    }
    const binding = requireBoundPolicyApproval(admitted);
    if (authority !== binding.authority) {
      return rejectPolicy("invocation authority is not trusted: admission-bound authority required");
    }
    const bound = binding.approval;
    const live = resolvePolicyApproval(binding.authority, admitted.descriptor.external_extension_id);
    if (policyFingerprint(live) !== policyFingerprint(bound)) {
      return rejectPolicy("policy approval changed or was revoked after admission");
    }
    requireOwnerEvidenceMatch(admitted.descriptor, live, binding.authority);
    if (activation.policy_version !== bound.activation_policy_version) {
      return rejectPolicy("activation policy_version is not issued by Noema Policy / Approval");
    }
    const runtimeNow = requireRuntimeWindow(admitted.descriptor, live);
    const normalizedRequest = snapshotInvocationRequest(request);
    requireEventNotFuture(normalizedRequest.invoked_at, runtimeNow, "invocation");

    // Core invocation is pure admission: running it before Web Crypto preserves
    // synchronous validation while the result remains unpublished until digest success.
    const result = coreInvokeExternalExtension(
      admitted,
      activation,
      normalizedRequest,
      binding.authority,
      retained,
    );

    return digestExternalExtensionInvocationEnvelope(normalizedRequest)
      .then((requestDigest) => {
        if (retained !== null) {
          const retainedDigest = BOUND_INVOCATION_REQUESTS.get(retained);
          if (retainedDigest === undefined) {
            return rejectPolicy("invocation receipt authority is not trusted");
          }
          if (retainedDigest !== requestDigest) {
            return rejectPolicy("invocation event conflicts with the retained receipt");
          }
        }
        BOUND_INVOCATION_REQUESTS.set(result.receipt, requestDigest);
        return result;
      })
      .catch((error: unknown) => {
        if (error instanceof ExternalExtensionAdmissionError) throw error;
        return rejectPolicy("invocation replay digest could not be produced safely");
      });
  } catch (error) {
    if (error instanceof ExternalExtensionAdmissionError) throw error;
    return rejectPolicy("invocation request could not be read safely");
  }
}
