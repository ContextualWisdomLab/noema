import { describe, expect, it } from "vitest";

import {
  activateExternalExtension,
  type AdmittedExternalExtension,
  type ExternalExtensionDescriptor,
  type TrustedExtensionCatalogEntry,
} from "../src/tool-capability/external-extension-admission";

const COMMIT = "a".repeat(40);
const ARTIFACT = "b".repeat(64);
const MARKETPLACE = "c".repeat(64);

const descriptor: ExternalExtensionDescriptor = Object.freeze({
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
  isolation_profile_reference: "urn:cwl:noema:isolation_profile:developer-assist-v1",
  egress_policy_reference: "urn:cwl:noema:egress_policy:deny-unreviewed-v1",
  appguardrail_scan_receipt: "appguard-receipt",
  quarantine_analysis_receipt: "quarantine-receipt",
  approval_status: "active",
  valid_from: "2026-09-01T00:00:00.000Z",
  valid_to: "2026-12-01T00:00:00.000Z",
  supersedes_extension_id: "",
  rollback_reference: "",
});

const catalog: TrustedExtensionCatalogEntry = Object.freeze({
  external_extension_id: descriptor.external_extension_id,
  upstream_repository: descriptor.upstream_repository,
  upstream_commit_sha: descriptor.upstream_commit_sha,
  upstream_path: descriptor.upstream_path,
  artifact_sha256: descriptor.artifact_sha256,
  marketplace_entry_sha256: descriptor.marketplace_entry_sha256,
});

describe("external extension admission provenance", () => {
  it("rejects a structurally fabricated admitted extension at activation", () => {
    const fabricated = Object.freeze({ descriptor, catalog }) as AdmittedExternalExtension;

    expect(() =>
      activateExternalExtension(fabricated, {
        activation_id: "activation-rust-01",
        product_repository: "ContextualWisdomLab/fast-mlsirm",
        execution_role: "maintainer_review",
        execution_mode: "developer_assist",
        policy_version: "urn:cwl:noema:external_extension_activation:developer-assist-v1",
        activated_at: "2026-09-08T06:00:00.000Z",
      }),
    ).toThrow(/admission authority is not trusted/);
  });
});
