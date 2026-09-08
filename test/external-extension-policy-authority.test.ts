import { describe, expect, it } from "vitest";

import {
  PinnedExternalExtensionAuthority,
  admitExternalExtension,
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
const APPGUARDRAIL_PROFILE = "urn:cwl:appguardrail:claude_plugin_scan:policy-v1";
const APPGUARDRAIL_PROFILE_SHA256 = "d".repeat(64);
const QUARANTINE_PROFILE = "urn:cwl:quarantine:claude_plugin_package_analysis:profile-v1";
const QUARANTINE_PROFILE_SHA256 = "e".repeat(64);

const descriptor = (
  overrides: Partial<ExternalExtensionDescriptor> = {},
): ExternalExtensionDescriptor => ({
  external_extension_id: "rust_review_guidance",
  capability_code: "rust_review_guidance",
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
  input_schema_reference: "urn:cwl:noema:external_extension_input:review-v1",
  output_schema_reference: "urn:cwl:noema:external_extension_output:review-v1",
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
  approval_status: "approved_for_pilot",
  valid_from: "2026-09-01T00:00:00.000Z",
  valid_to: "2026-12-01T00:00:00.000Z",
  supersedes_extension_id: "",
  rollback_reference: "",
  ...overrides,
});

const catalog: TrustedExtensionCatalogEntry = {
  external_extension_id: "rust_review_guidance",
  upstream_repository: "anthropics/claude-plugins-community",
  upstream_commit_sha: COMMIT,
  upstream_path: "plugins/rust-best-practices",
  artifact_sha256: ARTIFACT,
  marketplace_entry_sha256: MARKETPLACE,
};

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

const policyEvidence = {
  appguardrail_policy_profile_id: APPGUARDRAIL_PROFILE,
  appguardrail_policy_profile_sha256: APPGUARDRAIL_PROFILE_SHA256,
  quarantine_policy_profile_id: QUARANTINE_PROFILE,
  quarantine_policy_profile_sha256: QUARANTINE_PROFILE_SHA256,
} as const;

describe("external extension policy approval authority", () => {
  it("rejects a self-asserted active product grant that is absent from trusted pins", () => {
    const authority = new PinnedExternalExtensionAuthority([catalog], receipts);
    const broadened = descriptor({
      approval_status: "active",
      allowed_product_repositories: ["ContextualWisdomLab/noema"],
      allowed_execution_roles: ["release_operator"],
    });

    expect(() => admitExternalExtension(broadened, authority)).toThrow(
      /policy approval authority is required before admission/,
    );
  });

  it("rejects policy approval fields that mutate between validation and snapshot", () => {
    const pins = new PinnedExternalExtensionAuthority([catalog], receipts);
    let statusReads = 0;
    const mutatingApproval: TrustedExtensionPolicyApproval = {
      external_extension_id: "rust_review_guidance",
      get max_approval_status(): "approved_for_pilot" | "active" {
        statusReads += 1;
        return statusReads >= 3 ? "active" : "approved_for_pilot";
      },
      allowed_product_repositories: ["ContextualWisdomLab/fast-mlsirm"],
      allowed_execution_roles: ["maintainer_review"],
      valid_from: "2026-09-01T00:00:00.000Z",
      valid_to: "2026-12-01T00:00:00.000Z",
      isolation_profile_reference: ISOLATION,
      egress_policy_reference: "urn:cwl:noema:egress_policy:deny-unreviewed-v1",
      activation_policy_version: "urn:cwl:noema:external_extension_activation:developer-assist-v1",
      ...policyEvidence,
    };
    const authority: ExternalExtensionAuthority = {
      resolveCatalog: (extensionId) => pins.resolveCatalog(extensionId),
      resolveScanReceipt: (receiptId) => pins.resolveScanReceipt(receiptId),
      resolvePolicyApproval: () => mutatingApproval,
    };

    expect(() =>
      admitExternalExtension(
        descriptor({
          approval_status: "active",
        }),
        authority,
      ),
    ).toThrow(/trusted policy approval could not be read safely|policy approval authority is required/);
  });

  it("fails closed when policy approval accessors throw during normalization", () => {
    const pins = new PinnedExternalExtensionAuthority([catalog], receipts);
    const stableApproval: TrustedExtensionPolicyApproval = {
      external_extension_id: "rust_review_guidance",
      max_approval_status: "approved_for_pilot",
      allowed_product_repositories: ["ContextualWisdomLab/fast-mlsirm"],
      allowed_execution_roles: ["maintainer_review"],
      valid_from: "2026-09-01T00:00:00.000Z",
      valid_to: "2026-12-01T00:00:00.000Z",
      isolation_profile_reference: ISOLATION,
      egress_policy_reference: "urn:cwl:noema:egress_policy:deny-unreviewed-v1",
      activation_policy_version: "urn:cwl:noema:external_extension_activation:developer-assist-v1",
      ...policyEvidence,
    };
    const throwingApproval = new Proxy(stableApproval, {
      get(target, property, receiver) {
        if (property === "allowed_product_repositories") {
          throw new Error("hostile policy accessor");
        }
        return Reflect.get(target, property, receiver);
      },
    });
    const authority: ExternalExtensionAuthority = {
      resolveCatalog: (extensionId) => pins.resolveCatalog(extensionId),
      resolveScanReceipt: (receiptId) => pins.resolveScanReceipt(receiptId),
      resolvePolicyApproval: () => throwingApproval,
    };

    expect(() => admitExternalExtension(descriptor(), authority)).toThrow(
      /trusted policy approval could not be read safely/,
    );
  });
});
