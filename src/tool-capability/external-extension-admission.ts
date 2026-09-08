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
  type TrustedExtensionScanReceipt,
} from "./internal/external-extension-admission-core";

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
  TrustedExtensionScanReceipt,
} from "./internal/external-extension-admission-core";

/**
 * Noema-owned Policy / Approval issuance for one external extension. The grant is
 * independent of marketplace metadata and scanner receipts and bounds every
 * product, role, validity, isolation, egress, and activation-policy claim.
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
}

/**
 * Composite trust port used by external-extension admission. Catalog and scan
 * ownership remain delegated to their canonical owners; Noema Policy / Approval
 * may supply or revoke its own independently issued grant.
 */
export interface ExternalExtensionAuthority extends CoreExternalExtensionAuthority {
  resolvePolicyApproval?(
    extensionId: string,
  ): TrustedExtensionPolicyApproval | null;
}

const POLICY_REFERENCE_PATTERN = /^urn:cwl:[a-z0-9][a-z0-9._:-]{3,253}$/u;
const SOURCE_ISSUED_POLICY_APPROVALS = Object.freeze([
  Object.freeze<TrustedExtensionPolicyApproval>({
    external_extension_id: "rust_review_guidance",
    max_approval_status: "approved_for_pilot",
    allowed_product_repositories: Object.freeze(["ContextualWisdomLab/fast-mlsirm"]),
    allowed_execution_roles: Object.freeze(["maintainer_review"]),
    valid_from: "2026-09-01T00:00:00.000Z",
    valid_to: "2026-12-01T00:00:00.000Z",
    isolation_profile_reference: "urn:cwl:noema:isolation_profile:developer-assist-v1",
    egress_policy_reference: "urn:cwl:noema:egress_policy:deny-unreviewed-v1",
    activation_policy_version: "urn:cwl:noema:external_extension_activation:developer-assist-v1",
  }),
]);

const BOUND_POLICY_APPROVALS = new WeakMap<
  AdmittedExternalExtension,
  Readonly<TrustedExtensionPolicyApproval>
>();
const BOUND_INVOCATION_REQUESTS = new WeakMap<
  ExternalExtensionInvocationReceipt,
  Readonly<ExternalExtensionInvocationRequest>
>();

function rejectPolicy(message: string): never {
  throw new ExternalExtensionAdmissionError(message);
}

function freezePolicyApproval(
  candidate: TrustedExtensionPolicyApproval,
): Readonly<TrustedExtensionPolicyApproval> {
  if (candidate === null || typeof candidate !== "object") {
    return rejectPolicy("trusted policy approval is malformed");
  }
  if (
    !Array.isArray(candidate.allowed_product_repositories) ||
    !Array.isArray(candidate.allowed_execution_roles)
  ) {
    return rejectPolicy("trusted policy approval scope is malformed");
  }
  const scalarFields = [
    candidate.external_extension_id,
    candidate.max_approval_status,
    candidate.valid_from,
    candidate.valid_to,
    candidate.isolation_profile_reference,
    candidate.egress_policy_reference,
    candidate.activation_policy_version,
  ];
  const scalarShapeValid = scalarFields.every((value) => typeof value === "string");
  const scopeShapeValid = [
    ...candidate.allowed_product_repositories,
    ...candidate.allowed_execution_roles,
  ].every((value) => typeof value === "string");
  const statusValid =
    candidate.max_approval_status === "approved_for_pilot" ||
    candidate.max_approval_status === "active";
  const policyVersionValid =
    typeof candidate.activation_policy_version === "string" &&
    POLICY_REFERENCE_PATTERN.test(candidate.activation_policy_version);
  if ([scalarShapeValid, scopeShapeValid, statusValid, policyVersionValid].includes(false)) {
    return rejectPolicy("trusted policy approval fields are malformed");
  }
  return Object.freeze({
    external_extension_id: candidate.external_extension_id,
    max_approval_status: candidate.max_approval_status,
    allowed_product_repositories: Object.freeze([...candidate.allowed_product_repositories]),
    allowed_execution_roles: Object.freeze([...candidate.allowed_execution_roles]),
    valid_from: candidate.valid_from,
    valid_to: candidate.valid_to,
    isolation_profile_reference: candidate.isolation_profile_reference,
    egress_policy_reference: candidate.egress_policy_reference,
    activation_policy_version: candidate.activation_policy_version,
  });
}

function sourceIssuedPolicyApproval(
  extensionId: string,
): Readonly<TrustedExtensionPolicyApproval> | null {
  return (
    SOURCE_ISSUED_POLICY_APPROVALS.find(
      (approval) => approval.external_extension_id === extensionId,
    ) ?? null
  );
}

function resolvePolicyApproval(
  authority: ExternalExtensionAuthority,
  extensionId: string,
): Readonly<TrustedExtensionPolicyApproval> {
  let candidate: TrustedExtensionPolicyApproval | null;
  try {
    const resolver = authority.resolvePolicyApproval;
    if (resolver === undefined) {
      candidate = sourceIssuedPolicyApproval(extensionId);
    } else {
      candidate = resolver.call(authority, extensionId);
    }
  } catch {
    return rejectPolicy("trusted policy approval lookup failed");
  }
  if (candidate === null) {
    return rejectPolicy("policy approval authority is required before admission");
  }
  try {
    return freezePolicyApproval(candidate);
  } catch (error) {
    if (error instanceof ExternalExtensionAdmissionError) throw error;
    return rejectPolicy("trusted policy approval could not be read safely");
  }
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

function requireRuntimeWindow(
  descriptor: Readonly<ExternalExtensionDescriptor>,
  approval: Readonly<TrustedExtensionPolicyApproval>,
): void {
  const runtimeNow = Date.now();
  const validFrom = Math.max(Date.parse(descriptor.valid_from), Date.parse(approval.valid_from));
  const validTo = Math.min(Date.parse(descriptor.valid_to), Date.parse(approval.valid_to));
  if (runtimeNow < validFrom || runtimeNow >= validTo) {
    rejectPolicy("runtime clock is outside the approved validity window");
  }
}

function policyFingerprint(approval: Readonly<TrustedExtensionPolicyApproval>): string {
  return JSON.stringify(approval);
}

function snapshotInvocationRequest(
  request: ExternalExtensionInvocationRequest,
): Readonly<ExternalExtensionInvocationRequest> {
  if (request === null || typeof request !== "object") {
    return rejectPolicy("invocation request could not be read safely");
  }
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

function sameInvocationRequest(
  left: Readonly<ExternalExtensionInvocationRequest>,
  right: Readonly<ExternalExtensionInvocationRequest>,
): boolean {
  return (
    left.activation_id === right.activation_id &&
    left.invocation_id === right.invocation_id &&
    left.execution_mode === right.execution_mode &&
    left.invoked_at === right.invoked_at &&
    left.instruction === right.instruction &&
    left.observed_content === right.observed_content &&
    left.promote_observed_content === right.promote_observed_content &&
    left.secret_material === right.secret_material &&
    left.product_record === right.product_record &&
    left.hidden_reasoning === right.hidden_reasoning
  );
}

function requireBoundPolicyApproval(
  admitted: AdmittedExternalExtension,
): Readonly<TrustedExtensionPolicyApproval> {
  const approval = BOUND_POLICY_APPROVALS.get(admitted);
  if (approval === undefined) {
    return rejectPolicy(
      "admission authority is not trusted: Noema policy approval binding is missing",
    );
  }
  return approval;
}

/**
 * Operator-pinned catalog, scanner, and Noema Policy / Approval authority. When
 * no explicit policy list is supplied, only the source-issued pilot grants in
 * this module are available; unknown extensions remain fail-closed.
 */
export class PinnedExternalExtensionAuthority
  extends CorePinnedExternalExtensionAuthority
  implements ExternalExtensionAuthority
{
  private readonly policyApprovals: ReadonlyMap<
    string,
    Readonly<TrustedExtensionPolicyApproval>
  >;

  constructor(
    catalog: readonly TrustedExtensionCatalogEntry[],
    receipts: readonly TrustedExtensionScanReceipt[],
    policyApprovals: readonly TrustedExtensionPolicyApproval[] = SOURCE_ISSUED_POLICY_APPROVALS,
  ) {
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
  }

  resolvePolicyApproval(extensionId: string): TrustedExtensionPolicyApproval | null {
    return this.policyApprovals.get(extensionId) ?? null;
  }
}

/**
 * Admit one descriptor only after core source/scan validation and an independent
 * Noema Policy / Approval issuance both authorize the requested grant.
 *
 * @param candidate Untrusted descriptor supplied at the Tool / Capability boundary.
 * @param authority Independently populated source, scan, and Noema policy pins.
 * @returns Frozen admitted descriptor bound to module-private policy authority.
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
    BOUND_POLICY_APPROVALS.set(admitted, approval);
    return admitted;
  } catch (error) {
    if (error instanceof ExternalExtensionAdmissionError) throw error;
    return rejectPolicy("admission request could not be read safely");
  }
}

/**
 * Activate an admitted extension only when the activation cites the same Noema
 * policy version that issued the bounded product/role grant and the trusted
 * runtime clock remains inside the issued validity window.
 *
 * @param admitted Frozen admission snapshot from `admitExternalExtension`.
 * @param request Product-scoped activation identity and event time.
 * @param retained Previously admitted activation for this extension, if any.
 * @returns Accepted or replayed frozen activation.
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
    const approval = requireBoundPolicyApproval(admitted);
    if (request.policy_version !== approval.activation_policy_version) {
      return rejectPolicy("activation policy_version is not issued by Noema Policy / Approval");
    }
    requireRuntimeWindow(admitted.descriptor, approval);
    return coreActivateExternalExtension(admitted, request, retained);
  } catch (error) {
    if (error instanceof ExternalExtensionAdmissionError) throw error;
    return rejectPolicy("activation request could not be read safely");
  }
}

/**
 * Invoke an admitted extension only while the independently issued policy grant
 * is still live, byte-for-byte equivalent to the grant bound at admission, and
 * the trusted runtime clock remains inside the issued validity window. Replay
 * authority is also bound to one exact normalized invocation envelope so the
 * same invocation identity cannot silently authorize different work.
 *
 * @param admitted Frozen admission snapshot.
 * @param activation Frozen product-scoped activation.
 * @param request Untrusted invocation envelope; its timestamp is event evidence, not current-time authority.
 * @param authority Live source, scan, and policy authority used to detect drift.
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
    if (admitted === null || typeof admitted !== "object") {
      return coreInvokeExternalExtension(admitted, activation, request, authority, retained);
    }
    const bound = requireBoundPolicyApproval(admitted);
    const live = resolvePolicyApproval(authority, admitted.descriptor.external_extension_id);
    if (policyFingerprint(live) !== policyFingerprint(bound)) {
      return rejectPolicy("policy approval changed or was revoked after admission");
    }
    if (activation.policy_version !== bound.activation_policy_version) {
      return rejectPolicy("activation policy_version is not issued by Noema Policy / Approval");
    }
    requireRuntimeWindow(admitted.descriptor, live);
    const normalizedRequest = snapshotInvocationRequest(request);
    if (retained !== null) {
      const retainedRequest = BOUND_INVOCATION_REQUESTS.get(retained);
      if (retainedRequest !== undefined && !sameInvocationRequest(retainedRequest, normalizedRequest)) {
        return rejectPolicy("invocation event conflicts with the retained receipt");
      }
    }
    const result = coreInvokeExternalExtension(
      admitted,
      activation,
      normalizedRequest,
      authority,
      retained,
    );
    BOUND_INVOCATION_REQUESTS.set(result.receipt, normalizedRequest);
    return result;
  } catch (error) {
    if (error instanceof ExternalExtensionAdmissionError) throw error;
    return rejectPolicy("invocation request could not be read safely");
  }
}
