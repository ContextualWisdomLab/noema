import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PinnedExternalExtensionAuthority,
  activateExternalExtension,
  admitExternalExtension,
  invokeExternalExtension,
  type ExternalExtensionDescriptor,
  type TrustedExtensionCatalogEntry,
  type TrustedExtensionPolicyApproval,
  type TrustedExtensionScanReceipt,
} from "../src/tool-capability/external-extension-admission";

const COMMIT = "a".repeat(40);
const ARTIFACT = "b".repeat(64);
const MARKETPLACE = "c".repeat(64);
const ISOLATION = "urn:cwl:noema:isolation_profile:developer-assist-v1";
const EGRESS = "urn:cwl:noema:egress_policy:deny-unreviewed-v1";
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

const appguardrailReceipt: TrustedExtensionScanReceipt = {
  receipt_id: descriptor.appguardrail_scan_receipt,
  artifact_sha256: ARTIFACT,
  policy_version: ISOLATION,
  producer: "appguardrail",
};

const quarantineReceipt: TrustedExtensionScanReceipt = {
  receipt_id: descriptor.quarantine_analysis_receipt,
  artifact_sha256: ARTIFACT,
  policy_version: ISOLATION,
  producer: "quarantine-sandbox-runtime",
};

const policy: TrustedExtensionPolicyApproval = {
  external_extension_id: descriptor.external_extension_id,
  max_approval_status: "active",
  allowed_product_repositories: ["ContextualWisdomLab/fast-mlsirm"],
  allowed_execution_roles: ["maintainer_review"],
  valid_from: "2026-09-01T00:00:00.000Z",
  valid_to: "2026-12-01T00:00:00.000Z",
  isolation_profile_reference: ISOLATION,
  egress_policy_reference: EGRESS,
  activation_policy_version: POLICY,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("external extension replay digest provider failure", () => {
  it("fails closed when Worker Web Crypto rejects the invocation digest", async () => {
    const authority = new PinnedExternalExtensionAuthority(
      [catalog],
      [appguardrailReceipt, quarantineReceipt],
      [policy],
    );
    const admitted = admitExternalExtension(descriptor, authority);
    const activation = activateExternalExtension(admitted, {
      activation_id: "activation-rust-01",
      product_repository: "ContextualWisdomLab/fast-mlsirm",
      execution_role: "maintainer_review",
      execution_mode: "developer_assist",
      policy_version: POLICY,
      activated_at: "2026-09-08T06:00:00.000Z",
    }).activation;

    vi.spyOn(globalThis.crypto.subtle, "digest").mockRejectedValueOnce(
      new Error("digest provider unavailable"),
    );

    await expect(
      invokeExternalExtension(
        admitted,
        activation,
        {
          activation_id: activation.activation_id,
          invocation_id: "invocation-rust-provider-failure",
          execution_mode: "developer_assist",
          invoked_at: "2026-09-08T06:05:00.000Z",
          instruction: "Review the exact current-head Rust change.",
          observed_content: "",
          promote_observed_content: false,
          secret_material: "",
          product_record: "",
          hidden_reasoning: "",
        },
        authority,
      ),
    ).rejects.toThrow(/invocation replay digest could not be produced safely/);
  });
});
