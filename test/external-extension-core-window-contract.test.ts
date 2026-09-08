import { describe, expect, it } from "vitest";

import {
  PinnedExternalExtensionAuthority,
  admitExternalExtension,
  type ExternalExtensionDescriptor,
  type TrustedExtensionCatalogEntry,
  type TrustedExtensionPolicyApproval,
  type TrustedExtensionScanReceipt,
} from "../src/tool-capability/external-extension-admission";
import {
  activateExternalExtension as activateCoreExtension,
  invokeExternalExtension as invokeCoreExtension,
} from "../src/tool-capability/internal/external-extension-admission-core";

const COMMIT = "a".repeat(40);
const ARTIFACT = "b".repeat(64);
const MARKETPLACE = "c".repeat(64);
const ISOLATION = "urn:cwl:noema:isolation_profile:developer-assist-v1";
const EGRESS = "urn:cwl:noema:egress_policy:deny-unreviewed-v1";
const POLICY = "urn:cwl:noema:external_extension_activation:developer-assist-v1";
const VALID_FROM = "2026-09-01T00:00:00.000Z";
const VALID_TO = "2026-12-01T00:00:00.000Z";
const ACTIVATED_AT = "2026-09-08T06:00:00.000Z";

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
  valid_from: VALID_FROM,
  valid_to: VALID_TO,
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

const receipts: TrustedExtensionScanReceipt[] = [
  {
    receipt_id: descriptor.appguardrail_scan_receipt,
    artifact_sha256: ARTIFACT,
    policy_version: ISOLATION,
    producer: "appguardrail",
  },
  {
    receipt_id: descriptor.quarantine_analysis_receipt,
    artifact_sha256: ARTIFACT,
    policy_version: ISOLATION,
    producer: "quarantine-sandbox-runtime",
  },
];

const activePolicy: TrustedExtensionPolicyApproval = {
  external_extension_id: descriptor.external_extension_id,
  max_approval_status: "active",
  allowed_product_repositories: ["ContextualWisdomLab/fast-mlsirm"],
  allowed_execution_roles: ["maintainer_review"],
  valid_from: VALID_FROM,
  valid_to: VALID_TO,
  isolation_profile_reference: ISOLATION,
  egress_policy_reference: EGRESS,
  activation_policy_version: POLICY,
};

const admittedFixture = () => {
  const trustedAuthority = new PinnedExternalExtensionAuthority(
    [catalog],
    receipts,
    [activePolicy],
  );
  const admitted = admitExternalExtension(descriptor, trustedAuthority);
  const activationRequest = {
    activation_id: "activation-rust-01",
    product_repository: "ContextualWisdomLab/fast-mlsirm",
    execution_role: "maintainer_review",
    execution_mode: "developer_assist" as const,
    policy_version: POLICY,
    activated_at: ACTIVATED_AT,
  };
  return { trustedAuthority, admitted, activationRequest };
};

describe("external extension core validity-window contract", () => {
  it("retains the core conflicting-activation rejection beneath the stricter public clock boundary", () => {
    const { admitted, activationRequest } = admittedFixture();
    const accepted = activateCoreExtension(admitted, activationRequest);

    expect(() =>
      activateCoreExtension(
        admitted,
        { ...activationRequest, activated_at: "2026-09-08T07:00:00.000Z" },
        accepted.activation,
      ),
    ).toThrow(/activation event conflicts with the retained activation/);
  });

  it("retains the core expiry rejection beneath the stricter public runtime-window boundary", () => {
    const { trustedAuthority, admitted, activationRequest } = admittedFixture();
    const accepted = activateCoreExtension(admitted, activationRequest);

    expect(() =>
      invokeCoreExtension(
        admitted,
        accepted.activation,
        {
          activation_id: activationRequest.activation_id,
          invocation_id: "invocation-rust-01",
          execution_mode: "developer_assist",
          invoked_at: VALID_TO,
          instruction: "Review the exact current-head source.",
          observed_content: "",
          promote_observed_content: false,
          secret_material: "",
          product_record: "",
          hidden_reasoning: "",
        },
        trustedAuthority,
      ),
    ).toThrow(/expired extension cannot be invoked/);
  });
});
