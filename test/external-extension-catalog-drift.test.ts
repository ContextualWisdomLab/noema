import { describe, expect, it } from "vitest";

import {
  PinnedExternalExtensionAuthority,
  activateExternalExtension,
  admitExternalExtension,
  invokeExternalExtension,
  type ExternalExtensionAuthority,
  type ExternalExtensionDescriptor,
  type TrustedExtensionCatalogEntry,
  type TrustedExtensionPolicyApproval,
  type TrustedExtensionScanReceipt,
} from "../src/tool-capability/external-extension-admission";

const COMMIT = "a".repeat(40);
const ARTIFACT = "b".repeat(64);
const MARKETPLACE = "c".repeat(64);
const ISOLATION = "urn:cwl:noema:isolation_profile:developer-assist-v1";
const POLICY = "urn:cwl:noema:external_extension_activation:developer-assist-v1";

const descriptor: ExternalExtensionDescriptor = {
  external_extension_id: "rust_review_guidance",
  capability_code: "rust_code_review_guidance",
  adoption_mode: "developer_assist",
  upstream_repository: "anthropics/claude-plugins-community",
  upstream_commit_sha: COMMIT,
  upstream_path: "plugins/rust-best-practices",
  artifact_sha256: ARTIFACT,
  marketplace_entry_sha256: MARKETPLACE,
  plugin_name: "rust-best-practices",
  plugin_version: "1.2.3",
  license_expression: "MIT",
  license_evidence_reference: "urn:cwl:noema:license_evidence:mit-v1",
  input_schema_reference: "urn:cwl:noema:external_extension_input:review-guidance-v1",
  output_schema_reference: "urn:cwl:noema:external_extension_output:review-guidance-v1",
  required_filesystem_capabilities: [],
  required_network_capabilities: [],
  required_process_capabilities: [],
  required_secret_handles: [],
  required_mcp_servers: [],
  allowed_product_repositories: ["ContextualWisdomLab/fast-mlsirm"],
  allowed_execution_roles: ["maintainer_review"],
  isolation_profile_reference: ISOLATION,
  egress_policy_reference: "urn:cwl:noema:egress_policy:deny-unreviewed-v1",
  appguardrail_scan_receipt: "appguard-receipt",
  quarantine_analysis_receipt: "quarantine-receipt",
  approval_status: "active",
  valid_from: "2026-09-01T00:00:00.000Z",
  valid_to: "2026-12-01T00:00:00.000Z",
  supersedes_extension_id: "",
  rollback_reference: "",
};

const catalog = (
  overrides: Partial<TrustedExtensionCatalogEntry> = {},
): TrustedExtensionCatalogEntry => ({
  external_extension_id: descriptor.external_extension_id,
  upstream_repository: descriptor.upstream_repository,
  upstream_commit_sha: descriptor.upstream_commit_sha,
  upstream_path: descriptor.upstream_path,
  artifact_sha256: descriptor.artifact_sha256,
  marketplace_entry_sha256: descriptor.marketplace_entry_sha256,
  ...overrides,
});

const receipts: TrustedExtensionScanReceipt[] = [
  {
    receipt_id: "appguard-receipt",
    artifact_sha256: ARTIFACT,
    policy_version: ISOLATION,
    producer: "appguardrail",
  },
  {
    receipt_id: "quarantine-receipt",
    artifact_sha256: ARTIFACT,
    policy_version: ISOLATION,
    producer: "quarantine-sandbox-runtime",
  },
];

const activePolicy: TrustedExtensionPolicyApproval = {
  external_extension_id: descriptor.external_extension_id,
  max_approval_status: "active",
  allowed_product_repositories: descriptor.allowed_product_repositories,
  allowed_execution_roles: descriptor.allowed_execution_roles,
  valid_from: descriptor.valid_from,
  valid_to: descriptor.valid_to,
  isolation_profile_reference: descriptor.isolation_profile_reference,
  egress_policy_reference: descriptor.egress_policy_reference,
  activation_policy_version: POLICY,
};

const pinned = (entry: TrustedExtensionCatalogEntry = catalog()) =>
  new PinnedExternalExtensionAuthority([entry], receipts, [activePolicy]);

const liveAuthorityReturning = (
  entry: TrustedExtensionCatalogEntry,
  revokedReceiptId = "",
): ExternalExtensionAuthority => {
  const receiptAuthority = pinned();
  return {
    resolveCatalog: () => entry,
    resolveScanReceipt: (receiptId) =>
      receiptId === revokedReceiptId ? null : receiptAuthority.resolveScanReceipt(receiptId),
    resolvePolicyApproval: () => activePolicy,
  };
};

const invokeAgainst = (authority: ExternalExtensionAuthority) => {
  const admitted = admitExternalExtension(descriptor, pinned());
  const activation = activateExternalExtension(admitted, {
    activation_id: "activation-rust-01",
    product_repository: "ContextualWisdomLab/fast-mlsirm",
    execution_role: "maintainer_review",
    execution_mode: "developer_assist",
    policy_version: "urn:cwl:noema:external_extension_activation:developer-assist-v1",
    activated_at: "2026-09-08T06:00:00.000Z",
  }).activation;

  return () =>
    invokeExternalExtension(
      admitted,
      activation,
      {
        activation_id: activation.activation_id,
        invocation_id: "invocation-rust-01",
        execution_mode: "developer_assist",
        invoked_at: "2026-09-08T06:05:00.000Z",
        instruction: "Review the current-head Rust change against the pinned guidance.",
        observed_content: "",
        promote_observed_content: false,
        secret_material: "",
        product_record: "",
        hidden_reasoning: "",
      },
      authority,
    );
};

describe("external extension live catalog identity", () => {
  it.each([
    ["extension id", catalog({ external_extension_id: "other_review_guidance" })],
    ["repository", catalog({ upstream_repository: "example/other-plugins" })],
    ["path", catalog({ upstream_path: "plugins/other" })],
    ["marketplace digest", catalog({ marketplace_entry_sha256: "d".repeat(64) })],
  ])("rejects %s drift after admission", (_label, driftedCatalog) => {
    expect(invokeAgainst(liveAuthorityReturning(driftedCatalog))).toThrow(
      /catalog drift cannot update an admitted extension/,
    );
  });

  it.each([
    ["AppGuardrail", "appguard-receipt"],
    ["quarantine", "quarantine-receipt"],
  ])("rejects revoked %s receipt after admission", (_label, receiptId) => {
    expect(invokeAgainst(liveAuthorityReturning(catalog(), receiptId))).toThrow(
      /trusted scan receipt is missing/,
    );
  });
});
