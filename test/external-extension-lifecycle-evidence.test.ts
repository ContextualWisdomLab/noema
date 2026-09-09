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

const request = (): ExternalExtensionLifecycleAppend => ({
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
});

const approval = (): TrustedExtensionPolicyApproval => ({
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

function authority(overrides: Partial<ExternalExtensionAuthority> = {}): ExternalExtensionAuthority {
  const receipts = new Map<string, TrustedExtensionScanReceipt>([
    [APP_RECEIPT, receipt("appguardrail")],
    [QUARANTINE_RECEIPT, receipt("quarantine-sandbox-runtime")],
  ]);
  return {
    resolveCatalog: () => null,
    resolveScanReceipt: (receiptId: string) => receipts.get(receiptId) ?? null,
    resolvePolicyApproval: () => approval(),
    ...overrides,
  } as ExternalExtensionAuthority;
}

const verifier = (source = authority(), now = NOW) =>
  new AuthorityBackedExternalExtensionLifecycleEvidenceVerifier(source, () => now);

async function expectRejected(
  source: ExternalExtensionAuthority,
  input = request(),
  now = NOW,
): Promise<void> {
  await expect(verifier(source, now).assertCurrentActivationEvidence(input)).rejects.toThrowError(
    ExternalExtensionLifecycleEvidenceError,
  );
}

describe("external-extension lifecycle live evidence verifier", () => {
  it("accepts only when current Noema approval and both owner receipts still match exact evidence", async () => {
    await expect(verifier().assertCurrentActivationEvidence(request())).resolves.toBeUndefined();
  });

  it("fails closed when the policy resolver is absent, throws, or reports revocation", async () => {
    await expectRejected(authority({ resolvePolicyApproval: undefined }));
    await expectRejected(authority({ resolvePolicyApproval: () => { throw new Error("offline"); } }));
    await expectRejected(authority({ resolvePolicyApproval: () => null }));
  });

  it("fails closed for every approval field that can change activation authority", async () => {
    const variants: TrustedExtensionPolicyApproval[] = [
      { ...approval(), external_extension_id: "other_extension" },
      { ...approval(), max_approval_status: "approved_for_pilot" },
      { ...approval(), allowed_product_repositories: ["ContextualWisdomLab/other"] },
      { ...approval(), allowed_execution_roles: ["review_only"] },
      { ...approval(), activation_policy_version: "urn:cwl:noema:policy:drift-v2" },
      { ...approval(), isolation_profile_reference: "urn:cwl:quarantine:isolation:drift-v2" },
      { ...approval(), egress_policy_reference: "urn:cwl:egressweave:policy:drift-v2" },
      { ...approval(), appguardrail_policy_profile_id: "urn:cwl:appguardrail:profile:drift-v2" },
      { ...approval(), appguardrail_policy_profile_sha256: "0".repeat(64) },
      { ...approval(), quarantine_policy_profile_id: "urn:cwl:quarantine:profile:drift-v2" },
      { ...approval(), quarantine_policy_profile_sha256: "0".repeat(64) },
      { ...approval(), valid_from: "not-a-date" },
      { ...approval(), valid_to: "not-a-date" },
      { ...approval(), valid_from: "2026-09-09T10:00:01.000Z" },
      { ...approval(), valid_to: "2026-09-09T10:00:00.000Z" },
    ];
    for (const candidate of variants) {
      await expectRejected(authority({ resolvePolicyApproval: () => candidate }));
    }
  });

  it("fails closed when owner receipt lookup throws, disappears, or changes identity/producer", async () => {
    await expectRejected(authority({ resolveScanReceipt: () => { throw new Error("offline"); } }));
    await expectRejected(authority({ resolveScanReceipt: () => null }));
    await expectRejected(authority({
      resolveScanReceipt: (receiptId: string) => ({
        ...receipt("appguardrail"),
        receipt_id: `${receiptId}:drift`,
      }),
    }));
    await expectRejected(authority({
      resolveScanReceipt: (receiptId: string) => receipt(
        receiptId === APP_RECEIPT ? "quarantine-sandbox-runtime" : "appguardrail",
      ),
    }));
  });

  it("fails closed when AppGuardrail evidence drifts from artifact, isolation envelope, profile, or profile digest", async () => {
    const variants: TrustedExtensionScanReceipt[] = [
      { ...receipt("appguardrail"), artifact_sha256: "f".repeat(64) },
      { ...receipt("appguardrail"), policy_version: "urn:cwl:quarantine:isolation:drift-v2" },
      { ...receipt("appguardrail"), policy_profile_id: "urn:cwl:appguardrail:profile:drift-v2" },
      { ...receipt("appguardrail"), policy_profile_sha256: "0".repeat(64) },
    ];
    for (const candidate of variants) {
      await expectRejected(authority({
        resolveScanReceipt: (receiptId: string) => receiptId === APP_RECEIPT
          ? candidate
          : receipt("quarantine-sandbox-runtime"),
      }));
    }
  });

  it("fails closed when quarantine evidence drifts from artifact, isolation envelope, profile, or profile digest", async () => {
    const variants: TrustedExtensionScanReceipt[] = [
      { ...receipt("quarantine-sandbox-runtime"), artifact_sha256: "f".repeat(64) },
      { ...receipt("quarantine-sandbox-runtime"), policy_version: "urn:cwl:quarantine:isolation:drift-v2" },
      { ...receipt("quarantine-sandbox-runtime"), policy_profile_id: "urn:cwl:quarantine:profile:drift-v2" },
      { ...receipt("quarantine-sandbox-runtime"), policy_profile_sha256: "0".repeat(64) },
    ];
    for (const candidate of variants) {
      await expectRejected(authority({
        resolveScanReceipt: (receiptId: string) => receiptId === QUARANTINE_RECEIPT
          ? candidate
          : receipt("appguardrail"),
      }));
    }
  });
});
