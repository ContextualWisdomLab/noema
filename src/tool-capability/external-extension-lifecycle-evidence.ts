import type {
  ExternalExtensionAuthority,
  TrustedExtensionPolicyApproval,
  TrustedExtensionScanReceipt,
} from "./external-extension-admission";
import {
  ExternalExtensionLifecycleEvidenceError,
  type ExternalExtensionLifecycleAppend,
  type ExternalExtensionLifecycleEvidenceVerifier,
} from "./external-extension-lifecycle-store";

/** Clock port used only to evaluate the live Noema Policy/Approval validity window. */
export type ExternalExtensionLifecycleClock = () => number;

function rejectEvidence(message: string): never {
  throw new ExternalExtensionLifecycleEvidenceError(message);
}

function resolveApproval(
  authority: ExternalExtensionAuthority,
  request: Readonly<ExternalExtensionLifecycleAppend>,
): TrustedExtensionPolicyApproval {
  const resolver = authority.resolvePolicyApproval;
  if (resolver === undefined) {
    return rejectEvidence("Noema Policy/Approval resolver is unavailable at activation time");
  }
  let approval: TrustedExtensionPolicyApproval | null;
  try {
    approval = resolver.call(authority, request.stream.external_extension_id);
  } catch {
    return rejectEvidence("Noema Policy/Approval lookup failed at activation time");
  }
  if (approval === null) {
    return rejectEvidence("Noema Policy/Approval evidence was revoked before activation");
  }
  return approval;
}

function resolveReceipt(
  authority: ExternalExtensionAuthority,
  receiptId: string,
  producer: TrustedExtensionScanReceipt["producer"],
): TrustedExtensionScanReceipt {
  let receipt: TrustedExtensionScanReceipt | null;
  try {
    receipt = authority.resolveScanReceipt(receiptId);
  } catch {
    return rejectEvidence(`${producer} evidence lookup failed at activation time`);
  }
  if (receipt === null || receipt.producer !== producer || receipt.receipt_id !== receiptId) {
    return rejectEvidence(`${producer} evidence was revoked or changed before activation`);
  }
  return receipt;
}

function canonicalScopeValues(values: readonly string[], label: string): readonly string[] {
  if (!Array.isArray(values) || values.some((value) => typeof value !== "string")) {
    return rejectEvidence(`Noema Policy/Approval ${label} is malformed at activation time`);
  }
  return [...new Set(values)].sort();
}

function canonicalApprovalInstant(value: string, label: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    return rejectEvidence(`Noema Policy/Approval ${label} is not a real canonical UTC instant`);
  }
  return parsed;
}

async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function approvalReferences(
  approval: TrustedExtensionPolicyApproval,
): Promise<Readonly<{ policy_approval_reference: string; effective_scope_reference: string }>> {
  const allowedProductRepositories = canonicalScopeValues(
    approval.allowed_product_repositories,
    "product repository scope",
  );
  const allowedExecutionRoles = canonicalScopeValues(
    approval.allowed_execution_roles,
    "execution role scope",
  );
  const scopeMaterial = {
    allowed_product_repositories: allowedProductRepositories,
    allowed_execution_roles: allowedExecutionRoles,
  };
  const approvalMaterial = {
    external_extension_id: approval.external_extension_id,
    max_approval_status: approval.max_approval_status,
    allowed_product_repositories: allowedProductRepositories,
    allowed_execution_roles: allowedExecutionRoles,
    valid_from: approval.valid_from,
    valid_to: approval.valid_to,
    isolation_profile_reference: approval.isolation_profile_reference,
    egress_policy_reference: approval.egress_policy_reference,
    activation_policy_version: approval.activation_policy_version,
    appguardrail_policy_profile_id: approval.appguardrail_policy_profile_id,
    appguardrail_policy_profile_sha256: approval.appguardrail_policy_profile_sha256,
    quarantine_policy_profile_id: approval.quarantine_policy_profile_id,
    quarantine_policy_profile_sha256: approval.quarantine_policy_profile_sha256,
  };
  const [scopeSha256, approvalSha256] = await Promise.all([
    sha256(scopeMaterial),
    sha256(approvalMaterial),
  ]);
  return {
    policy_approval_reference: `urn:cwl:noema:approval:sha256:${approvalSha256}`,
    effective_scope_reference: `urn:cwl:noema:scope:sha256:${scopeSha256}`,
  };
}

async function assertApprovalCurrent(
  request: Readonly<ExternalExtensionLifecycleAppend>,
  approval: TrustedExtensionPolicyApproval,
  now: number,
): Promise<void> {
  const validFrom = canonicalApprovalInstant(approval.valid_from, "valid_from");
  const validTo = canonicalApprovalInstant(approval.valid_to, "valid_to");
  const references = await approvalReferences(approval);
  const matches = [
    approval.external_extension_id === request.stream.external_extension_id,
    approval.max_approval_status === "active",
    approval.activation_policy_version === request.activation_policy_version,
    approval.isolation_profile_reference === request.isolation_profile_reference,
    approval.egress_policy_reference === request.egress_policy_reference,
    approval.appguardrail_policy_profile_id === request.appguardrail_profile_identity,
    approval.appguardrail_policy_profile_sha256 === request.appguardrail_profile_sha256,
    approval.quarantine_policy_profile_id === request.quarantine_profile_identity,
    approval.quarantine_policy_profile_sha256 === request.quarantine_profile_sha256,
    references.policy_approval_reference === request.policy_approval_reference,
    references.effective_scope_reference === request.effective_scope_reference,
    validFrom <= now,
    now < validTo,
  ];
  if (matches.includes(false)) {
    rejectEvidence("Noema Policy/Approval evidence expired or drifted before activation");
  }
}

function assertReceiptCurrent(
  request: Readonly<ExternalExtensionLifecycleAppend>,
  receipt: TrustedExtensionScanReceipt,
  expectedProfileIdentity: string,
  expectedProfileSha256: string,
): void {
  if (
    receipt.artifact_sha256 !== request.stream.artifact_sha256 ||
    receipt.policy_version !== request.isolation_profile_reference ||
    receipt.policy_profile_id !== expectedProfileIdentity ||
    receipt.policy_profile_sha256 !== expectedProfileSha256
  ) {
    rejectEvidence(`${receipt.producer} evidence drifted before activation`);
  }
}

/**
 * Revalidates activation evidence through the existing owner ports instead of
 * persisting or reimplementing AppGuardrail, quarantine, isolation, or egress truth.
 */
export class AuthorityBackedExternalExtensionLifecycleEvidenceVerifier
implements ExternalExtensionLifecycleEvidenceVerifier {
  constructor(
    private readonly authority: ExternalExtensionAuthority,
    private readonly clock: ExternalExtensionLifecycleClock = Date.now,
  ) {}

  async assertCurrentActivationEvidence(
    request: Readonly<ExternalExtensionLifecycleAppend>,
  ): Promise<void> {
    const approval = resolveApproval(this.authority, request);
    await assertApprovalCurrent(request, approval, this.clock());

    const appguardrail = resolveReceipt(
      this.authority,
      request.appguardrail_evidence_reference,
      "appguardrail",
    );
    assertReceiptCurrent(
      request,
      appguardrail,
      request.appguardrail_profile_identity,
      request.appguardrail_profile_sha256,
    );

    const quarantine = resolveReceipt(
      this.authority,
      request.quarantine_evidence_reference,
      "quarantine-sandbox-runtime",
    );
    assertReceiptCurrent(
      request,
      quarantine,
      request.quarantine_profile_identity,
      request.quarantine_profile_sha256,
    );
  }
}