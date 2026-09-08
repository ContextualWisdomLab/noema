import { describe, expect, it } from "vitest";

import {
  admitExternalExtension,
  activateExternalExtension,
  invokeExternalExtension,
  type ExternalExtensionAuthority,
  type ExternalExtensionDescriptor,
  type TrustedExtensionCatalogEntry,
  type TrustedExtensionPolicyApproval,
  type TrustedExtensionScanReceipt,
} from "../src/tool-capability/external-extension-admission";

const COMMIT_A = "a".repeat(40);
const COMMIT_B = "d".repeat(40);
const ARTIFACT = "b".repeat(64);
const MARKETPLACE = "c".repeat(64);
const ISOLATION = "urn:cwl:noema:isolation_profile:developer-assist-v1";
const EGRESS = "urn:cwl:noema:egress_policy:deny-unreviewed-v1";
const POLICY = "urn:cwl:noema:external_extension_activation:developer-assist-v1";
const APPGUARDRAIL_PROFILE = "urn:cwl:appguardrail:claude_plugin_scan:policy-v1";
const APPGUARDRAIL_PROFILE_SHA256 = "d".repeat(64);
const QUARANTINE_PROFILE = "urn:cwl:quarantine:claude_plugin_package_analysis:profile-v1";
const QUARANTINE_PROFILE_SHA256 = "e".repeat(64);

const descriptor = (commit: string): ExternalExtensionDescriptor => ({
  external_extension_id: "rust_review_guidance",
  capability_code: "rust_code_review_guidance",
  adoption_mode: "developer_assist",
  upstream_repository: "anthropics/claude-plugins-community",
  upstream_commit_sha: commit,
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
});

const catalog = (commit: string): TrustedExtensionCatalogEntry => ({
  external_extension_id: "rust_review_guidance",
  upstream_repository: "anthropics/claude-plugins-community",
  upstream_commit_sha: commit,
  upstream_path: "plugins/rust-best-practices",
  artifact_sha256: ARTIFACT,
  marketplace_entry_sha256: MARKETPLACE,
});

const receipts: TrustedExtensionScanReceipt[] = [
  {
    receipt_id: "appguard-receipt",
    artifact_sha256: ARTIFACT,
    policy_version: ISOLATION,
    producer: "appguardrail",
    policy_profile_id: APPGUARDRAIL_PROFILE,
    policy_profile_sha256: APPGUARDRAIL_PROFILE_SHA256,
  },
  {
    receipt_id: "quarantine-receipt",
    artifact_sha256: ARTIFACT,
    policy_version: ISOLATION,
    producer: "quarantine-sandbox-runtime",
    policy_profile_id: QUARANTINE_PROFILE,
    policy_profile_sha256: QUARANTINE_PROFILE_SHA256,
  },
];

const policy: TrustedExtensionPolicyApproval = {
  external_extension_id: "rust_review_guidance",
  max_approval_status: "active",
  allowed_product_repositories: ["ContextualWisdomLab/fast-mlsirm"],
  allowed_execution_roles: ["maintainer_review"],
  valid_from: "2026-09-01T00:00:00.000Z",
  valid_to: "2026-12-01T00:00:00.000Z",
  isolation_profile_reference: ISOLATION,
  egress_policy_reference: EGRESS,
  activation_policy_version: POLICY,
  appguardrail_policy_profile_id: APPGUARDRAIL_PROFILE,
  appguardrail_policy_profile_sha256: APPGUARDRAIL_PROFILE_SHA256,
  quarantine_policy_profile_id: QUARANTINE_PROFILE,
  quarantine_policy_profile_sha256: QUARANTINE_PROFILE_SHA256,
};

const activationRequest = () => ({
  activation_id: "activation-rust-01",
  product_repository: "ContextualWisdomLab/fast-mlsirm",
  execution_role: "maintainer_review",
  execution_mode: "developer_assist" as const,
  policy_version: POLICY,
  activated_at: "2026-09-08T06:00:00.000Z",
});

const invocationRequest = () => ({
  activation_id: "activation-rust-01",
  invocation_id: "invocation-rust-01",
  execution_mode: "developer_assist" as const,
  invoked_at: "2026-09-08T06:05:00.000Z",
  instruction: "Review the current-head Rust change against the admitted source identity.",
  observed_content: "",
  promote_observed_content: false,
  secret_material: "",
  product_record: "",
  hidden_reasoning: "",
});

const mutableAuthority = () => {
  let currentCatalog = catalog(COMMIT_A);
  const authority: ExternalExtensionAuthority = {
    resolveCatalog: () => currentCatalog,
    resolveScanReceipt: (receiptId) => receipts.find((receipt) => receipt.receipt_id === receiptId) ?? null,
    resolvePolicyApproval: () => policy,
  };
  return {
    authority,
    setCommit(commit: string) {
      currentCatalog = catalog(commit);
    },
  };
};

describe("external extension authority is bound to one exact admission", () => {
  it("rejects an authentic activation issued for a different exact admission", () => {
    const live = mutableAuthority();
    const firstAdmission = admitExternalExtension(descriptor(COMMIT_A), live.authority);
    const firstActivation = activateExternalExtension(firstAdmission, activationRequest()).activation;

    live.setCommit(COMMIT_B);
    const secondAdmission = admitExternalExtension(descriptor(COMMIT_B), live.authority);

    expect(() =>
      invokeExternalExtension(secondAdmission, firstActivation, invocationRequest(), live.authority),
    ).toThrow(/activation authority is not trusted/);
  });

  it("rejects activation replay retained from a different exact admission", () => {
    const live = mutableAuthority();
    const firstAdmission = admitExternalExtension(descriptor(COMMIT_A), live.authority);
    const firstActivation = activateExternalExtension(firstAdmission, activationRequest()).activation;

    live.setCommit(COMMIT_B);
    const secondAdmission = admitExternalExtension(descriptor(COMMIT_B), live.authority);

    expect(() =>
      activateExternalExtension(secondAdmission, activationRequest(), firstActivation),
    ).toThrow(/activation authority is not trusted/);
  });

  it("rejects invocation replay receipt retained from a different exact admission", async () => {
    const live = mutableAuthority();
    const firstAdmission = admitExternalExtension(descriptor(COMMIT_A), live.authority);
    const firstActivation = activateExternalExtension(firstAdmission, activationRequest()).activation;
    const firstInvocation = await invokeExternalExtension(
      firstAdmission,
      firstActivation,
      invocationRequest(),
      live.authority,
    );

    live.setCommit(COMMIT_B);
    const secondAdmission = admitExternalExtension(descriptor(COMMIT_B), live.authority);
    const secondActivation = activateExternalExtension(secondAdmission, activationRequest()).activation;

    expect(() =>
      invokeExternalExtension(
        secondAdmission,
        secondActivation,
        invocationRequest(),
        live.authority,
        firstInvocation.receipt,
      ),
    ).toThrow(/invocation receipt authority is not trusted/);
  });
});
