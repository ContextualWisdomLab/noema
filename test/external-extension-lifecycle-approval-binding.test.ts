import { describe, expect, it } from "vitest";

import type {
  ExternalExtensionAuthority,
  TrustedExtensionPolicyApproval,
  TrustedExtensionScanReceipt,
} from "../src/tool-capability/external-extension-admission";
import { AuthorityBackedExternalExtensionLifecycleEvidenceVerifier } from "../src/tool-capability/external-extension-lifecycle-evidence";
import {
  ExternalExtensionLifecycleEvidenceError,
  type ExternalExtensionLifecycleAppend,
} from "../src/tool-capability/external-extension-lifecycle-store";

const APP_PROFILE = "urn:cwl:appguardrail:profile:static-v1";
const APP_PROFILE_SHA = "d".repeat(64);
const QUARANTINE_PROFILE = "urn:cwl:quarantine:profile:plugin-v1";
const QUARANTINE_PROFILE_SHA = "e".repeat(64);
const ISOLATION = "urn:cwl:quarantine:isolation:plugin-v1";
const EGRESS = "urn:cwl:egressweave:policy:developer-assist-v1";
const POLICY = "urn:cwl:noema:external_extension_activation:developer-assist-v1";
const APPROVAL_REFERENCE = "urn:cwl:noema:approval:sha256:8a0c2b47521345cdb4b48201ad75abdae1f7cafcf85f52321dfae43900484260";
const SCOPE_REFERENCE = "urn:cwl:noema:scope:sha256:4766fe47fb6a89dd215767baf7f7b61ebc1b27a0ce7126d2963c2128e80affc2";
const APP_RECEIPT = "urn:cwl:appguardrail:receipt:scan-0001";
const QUARANTINE_RECEIPT = "urn:cwl:quarantine:receipt:analysis-0001";
const ARTIFACT = "a".repeat(64);
const NOW = Date.parse("2026-09-09T10:00:00.000Z");

const request = (
  overrides: Partial<ExternalExtensionLifecycleAppend> = {},
): ExternalExtensionLifecycleAppend => ({
  transition_id: "transition-0007",
  stream: {
    external_extension_id: "review_helper",
    upstream_repository: "anthropics/claude-plugins-community",
    upstream_commit_sha: "b".repeat(40),
    upstream_path: "plugins/review-helper",
    artifact_sha256: ARTIFACT,
    marketplace_entry_sha256: "c".repeat(64),
  },
  expected_version: 6,
  prior_state: "approved_for_pilot",
  next_state: "active",
  policy_approval_reference: APPROVAL_REFERENCE,
  activation_policy_version: POLICY,
  effective_scope_reference: SCOPE_REFERENCE,
  appguardrail_evidence_reference: APP_RECEIPT,
  appguardrail_profile_identity: APP_PROFILE,
  appguardrail_profile_sha256: APP_PROFILE_SHA,
  quarantine_evidence_reference: QUARANTINE_RECEIPT,
  quarantine_profile_identity: QUARANTINE_PROFILE,
  quarantine_profile_sha256: QUARANTINE_PROFILE_SHA,
  isolation_profile_reference: ISOLATION,
  egress_policy_reference: EGRESS,
  occurred_at: "2026-09-09T09:59:59.000Z",
  causation_id: "cause-0007",
  correlation_id: "correlation-0001",
  actor_identity_handle: "service:noema",
  ...overrides,
});

const approval = (
  overrides: Partial<TrustedExtensionPolicyApproval> = {},
): TrustedExtensionPolicyApproval => ({
  external_extension_id: "review_helper",
  max_approval_status: "active",
  allowed_product_repositories: ["ContextualWisdomLab/noema"],
  allowed_execution_roles: ["developer_assist"],
  valid_from: "2026-09-09T09:00:00.000Z",
  valid_to: "2026-09-09T11:00:00.000Z",
  isolation_profile_reference: ISOLATION,
  egress_policy_reference: EGRESS,
  activation_policy_version: POLICY,
  appguardrail_policy_profile_id: APP_PROFILE,
  appguardrail_policy_profile_sha256: APP_PROFILE_SHA,
  quarantine_policy_profile_id: QUARANTINE_PROFILE,
  quarantine_policy_profile_sha256: QUARANTINE_PROFILE_SHA,
  ...overrides,
});

const receipt = (
  producer: TrustedExtensionScanReceipt["producer"],
): TrustedExtensionScanReceipt => ({
  receipt_id: producer === "appguardrail" ? APP_RECEIPT : QUARANTINE_RECEIPT,
  artifact_sha256: ARTIFACT,
  policy_version: ISOLATION,
  producer,
  policy_profile_id: producer === "appguardrail" ? APP_PROFILE : QUARANTINE_PROFILE,
  policy_profile_sha256: producer === "appguardrail" ? APP_PROFILE_SHA : QUARANTINE_PROFILE_SHA,
});

function authority(currentApproval: TrustedExtensionPolicyApproval): ExternalExtensionAuthority {
  return {
    resolveCatalog: () => null,
    resolvePolicyApproval: () => currentApproval,
    resolveScanReceipt: (receiptId: string) => {
      if (receiptId === APP_RECEIPT) return receipt("appguardrail");
      if (receiptId === QUARANTINE_RECEIPT) return receipt("quarantine-sandbox-runtime");
      return null;
    },
  } as ExternalExtensionAuthority;
}

function verifier(currentApproval: TrustedExtensionPolicyApproval) {
  return new AuthorityBackedExternalExtensionLifecycleEvidenceVerifier(
    authority(currentApproval),
    () => NOW,
  );
}

describe("external-extension activation approval identity binding", () => {
  it("accepts the canonical approval and effective-scope identities", async () => {
    await expect(
      verifier(approval()).assertCurrentActivationEvidence(request()),
    ).resolves.toBeUndefined();
  });

  it("fails closed when the live approval narrows product repository scope", async () => {
    await expect(
      verifier(approval({ allowed_product_repositories: ["ContextualWisdomLab/other"] }))
        .assertCurrentActivationEvidence(request()),
    ).rejects.toThrowError(ExternalExtensionLifecycleEvidenceError);
  });

  it("fails closed when the live approval narrows execution-role scope", async () => {
    await expect(
      verifier(approval({ allowed_execution_roles: ["review_only"] }))
        .assertCurrentActivationEvidence(request()),
    ).rejects.toThrowError(ExternalExtensionLifecycleEvidenceError);
  });

  it("rejects a forged approval reference even when the live approval is otherwise current", async () => {
    await expect(
      verifier(approval()).assertCurrentActivationEvidence(request({
        policy_approval_reference: "urn:cwl:noema:approval:forged:v9",
      })),
    ).rejects.toThrowError(ExternalExtensionLifecycleEvidenceError);
  });

  it("rejects a forged effective-scope reference even when the live scope is otherwise current", async () => {
    await expect(
      verifier(approval()).assertCurrentActivationEvidence(request({
        effective_scope_reference: "urn:cwl:noema:scope:forged:v9",
      })),
    ).rejects.toThrowError(ExternalExtensionLifecycleEvidenceError);
  });
});
