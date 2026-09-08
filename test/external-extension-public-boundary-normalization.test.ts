import { describe, expect, it } from "vitest";

import {
  ExternalExtensionAdmissionError,
  PinnedExternalExtensionAuthority,
  activateExternalExtension,
  admitExternalExtension,
  invokeExternalExtension,
  type ExternalExtensionActivation,
  type ExternalExtensionAuthority,
  type ExternalExtensionDescriptor,
  type ExternalExtensionInvocationRequest,
  type TrustedExtensionCatalogEntry,
  type TrustedExtensionScanReceipt,
} from "../src/tool-capability/external-extension-admission";

const COMMIT = "a".repeat(40);
const ARTIFACT = "b".repeat(64);
const MARKETPLACE = "c".repeat(64);
const ISOLATION = "urn:cwl:noema:isolation_profile:developer-assist-v1";
const EGRESS = "urn:cwl:noema:egress_policy:deny-unreviewed-v1";
const POLICY = "urn:cwl:noema:external_extension_activation:developer-assist-v1";

const descriptor = (): ExternalExtensionDescriptor => ({
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
  },
  {
    receipt_id: "quarantine-receipt",
    artifact_sha256: ARTIFACT,
    policy_version: ISOLATION,
    producer: "quarantine-sandbox-runtime",
  },
];

const activationRequest = () => ({
  activation_id: "activation-rust-01",
  product_repository: "ContextualWisdomLab/fast-mlsirm",
  execution_role: "maintainer_review",
  execution_mode: "developer_assist" as const,
  policy_version: POLICY,
  activated_at: "2026-09-08T06:00:00.000Z",
});

const invocationRequest = (): ExternalExtensionInvocationRequest => ({
  activation_id: "activation-rust-01",
  invocation_id: "invocation-rust-01",
  execution_mode: "developer_assist",
  invoked_at: "2026-09-08T06:05:00.000Z",
  instruction: "Review this exact source against the admitted extension policy.",
  observed_content: "",
  promote_observed_content: false,
  secret_material: "",
  product_record: "",
  hidden_reasoning: "",
});

describe("external extension public boundary normalization", () => {
  it("normalizes null and hostile activation requests after admission authority is bound", () => {
    const authority = new PinnedExternalExtensionAuthority([catalog], receipts);
    const admitted = admitExternalExtension(descriptor(), authority);

    expect(() =>
      activateExternalExtension(
        admitted,
        null as unknown as Parameters<typeof activateExternalExtension>[1],
      ),
    ).toThrow(ExternalExtensionAdmissionError);

    const hostileRequest = Object.defineProperty(activationRequest(), "policy_version", {
      get() {
        throw new Error("hostile activation getter");
      },
    });
    expect(() => activateExternalExtension(admitted, hostileRequest)).toThrow(
      ExternalExtensionAdmissionError,
    );
  });

  it("normalizes hostile invocation activation and authority boundaries", () => {
    const authority = new PinnedExternalExtensionAuthority([catalog], receipts);
    const admitted = admitExternalExtension(descriptor(), authority);
    const activation = activateExternalExtension(admitted, activationRequest()).activation;

    expect(() =>
      invokeExternalExtension(
        admitted,
        null as unknown as ExternalExtensionActivation,
        invocationRequest(),
        authority,
      ),
    ).toThrow(ExternalExtensionAdmissionError);

    expect(() =>
      invokeExternalExtension(
        admitted,
        activation,
        invocationRequest(),
        null as unknown as ExternalExtensionAuthority,
      ),
    ).toThrow(ExternalExtensionAdmissionError);
  });

  it("normalizes a hostile policy resolver accessor during admission", () => {
    const coreAuthority = new PinnedExternalExtensionAuthority([catalog], receipts);
    const hostileAuthority = Object.defineProperty(
      {
        resolveCatalog: (extensionId: string) => coreAuthority.resolveCatalog(extensionId),
        resolveScanReceipt: (receiptId: string) => coreAuthority.resolveScanReceipt(receiptId),
      } as ExternalExtensionAuthority,
      "resolvePolicyApproval",
      {
        get() {
          throw new Error("hostile policy resolver accessor");
        },
      },
    );

    expect(() => admitExternalExtension(descriptor(), hostileAuthority)).toThrow(
      ExternalExtensionAdmissionError,
    );
  });
});
