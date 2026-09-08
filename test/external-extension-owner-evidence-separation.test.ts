import { describe, expect, it } from "vitest";

import {
  PinnedExternalExtensionAuthority,
  admitExternalExtension,
  type ExternalExtensionDescriptor,
  type TrustedExtensionCatalogEntry,
  type TrustedExtensionPolicyApproval,
  type TrustedExtensionScanReceipt,
} from "../src/tool-capability/external-extension-admission";

const COMMIT = "a".repeat(40);
const ARTIFACT = "b".repeat(64);
const MARKETPLACE = "c".repeat(64);
const APPGUARDRAIL_PROFILE = "urn:cwl:appguardrail:claude_plugin_scan:policy-v1";
const APPGUARDRAIL_PROFILE_SHA256 = "d".repeat(64);
const QUARANTINE_PROFILE = "urn:cwl:quarantine:claude_plugin_package_analysis:profile-v1";
const QUARANTINE_PROFILE_SHA256 = "e".repeat(64);
const ISOLATION = "urn:cwl:noema:isolation_profile:developer-assist-v1";
const EGRESS = "urn:cwl:noema:egress_policy:deny-unreviewed-v1";
const ACTIVATION_POLICY = "urn:cwl:noema:external_extension_activation:developer-assist-v1";

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
  egress_policy_reference: EGRESS,
  appguardrail_scan_receipt: "appguard-receipt",
  quarantine_analysis_receipt: "quarantine-receipt",
  approval_status: "active",
  valid_from: "2026-09-01T00:00:00.000Z",
  valid_to: "2026-12-01T00:00:00.000Z",
  supersedes_extension_id: "",
  rollback_reference: "",
};

const catalog: TrustedExtensionCatalogEntry = {
  external_extension_id: descriptor.external_extension_id,
  upstream_repository: descriptor.upstream_repository,
  upstream_commit_sha: descriptor.upstream_commit_sha,
  upstream_path: descriptor.upstream_path,
  artifact_sha256: descriptor.artifact_sha256,
  marketplace_entry_sha256: descriptor.marketplace_entry_sha256,
};

const policy: TrustedExtensionPolicyApproval = {
  external_extension_id: descriptor.external_extension_id,
  max_approval_status: "active",
  allowed_product_repositories: descriptor.allowed_product_repositories,
  allowed_execution_roles: descriptor.allowed_execution_roles,
  valid_from: descriptor.valid_from,
  valid_to: descriptor.valid_to,
  isolation_profile_reference: ISOLATION,
  egress_policy_reference: EGRESS,
  activation_policy_version: ACTIVATION_POLICY,
  appguardrail_policy_profile_id: APPGUARDRAIL_PROFILE,
  appguardrail_policy_profile_sha256: APPGUARDRAIL_PROFILE_SHA256,
  quarantine_policy_profile_id: QUARANTINE_PROFILE,
  quarantine_policy_profile_sha256: QUARANTINE_PROFILE_SHA256,
};

const receipt = (
  producer: "appguardrail" | "quarantine-sandbox-runtime",
  receiptId: string,
  profileId: string,
  profileSha256: string,
): TrustedExtensionScanReceipt => ({
  receipt_id: receiptId,
  artifact_sha256: ARTIFACT,
  policy_version: ISOLATION,
  producer,
  policy_profile_id: profileId,
  policy_profile_sha256: profileSha256,
});

const receipts = (
  appguardrailProfileSha256 = APPGUARDRAIL_PROFILE_SHA256,
): readonly TrustedExtensionScanReceipt[] => [
  receipt("appguardrail", "appguard-receipt", APPGUARDRAIL_PROFILE, appguardrailProfileSha256),
  receipt(
    "quarantine-sandbox-runtime",
    "quarantine-receipt",
    QUARANTINE_PROFILE,
    QUARANTINE_PROFILE_SHA256,
  ),
];

describe("external extension owner evidence separation", () => {
  it("admits independently pinned AppGuardrail scan-policy and quarantine profile evidence", () => {
    expect(() => {
      const authority = new PinnedExternalExtensionAuthority([catalog], receipts(), [policy]);
      admitExternalExtension(descriptor, authority);
    }).not.toThrow();
  });

  it("rejects AppGuardrail evidence whose exact policy bytes do not match Noema's required pin", () => {
    expect(() => {
      const authority = new PinnedExternalExtensionAuthority(
        [catalog],
        receipts("f".repeat(64)),
        [policy],
      );
      admitExternalExtension(descriptor, authority);
    }).toThrow(/scan receipt policy/i);
  });
});
