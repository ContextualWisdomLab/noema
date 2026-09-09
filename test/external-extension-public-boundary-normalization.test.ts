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
  type TrustedExtensionPolicyApproval,
  type TrustedExtensionScanReceipt,
} from "../src/tool-capability/external-extension-admission";

const COMMIT = "a".repeat(40);
const ARTIFACT = "b".repeat(64);
const MARKETPLACE = "c".repeat(64);
const ISOLATION = "urn:cwl:noema:isolation_profile:developer-assist-v1";
const EGRESS = "urn:cwl:noema:egress_policy:deny-unreviewed-v1";
const POLICY = "urn:cwl:noema:external_extension_activation:developer-assist-v1";
const APPGUARDRAIL_PROFILE = "urn:cwl:appguardrail:claude_plugin_scan:policy-v1";
const APPGUARDRAIL_PROFILE_SHA256 = "d".repeat(64);
const QUARANTINE_PROFILE = "urn:cwl:quarantine:claude_plugin_package_analysis:profile-v1";
const QUARANTINE_PROFILE_SHA256 = "e".repeat(64);

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

const activePolicy: TrustedExtensionPolicyApproval = {
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
    const authority = new PinnedExternalExtensionAuthority([catalog], receipts, [activePolicy]);
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
    const authority = new PinnedExternalExtensionAuthority([catalog], receipts, [activePolicy]);
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

  it("bounds invocation text by UTF-8 bytes before asynchronous replay digest work", async () => {
    const authority = new PinnedExternalExtensionAuthority([catalog], receipts, [activePolicy]);
    const admitted = admitExternalExtension(descriptor(), authority);
    const activation = activateExternalExtension(admitted, activationRequest()).activation;

    const exactBoundary = invocationRequest();
    exactBoundary.invocation_id = "invocation-boundary-01";
    exactBoundary.instruction = `${"가".repeat(2730)}ab`;
    expect(new TextEncoder().encode(exactBoundary.instruction)).toHaveLength(8192);
    await expect(
      invokeExternalExtension(admitted, activation, exactBoundary, authority),
    ).resolves.toMatchObject({ kind: "accepted" });

    const oversizedInstruction = invocationRequest();
    oversizedInstruction.invocation_id = "invocation-oversize-01";
    oversizedInstruction.instruction = "가".repeat(2731);
    expect(new TextEncoder().encode(oversizedInstruction.instruction)).toHaveLength(8193);
    expect(() =>
      invokeExternalExtension(admitted, activation, oversizedInstruction, authority),
    ).toThrow(ExternalExtensionAdmissionError);

    const oversizedObservedContent = invocationRequest();
    oversizedObservedContent.invocation_id = "invocation-oversize-02";
    oversizedObservedContent.observed_content = "가".repeat(2731);
    expect(new TextEncoder().encode(oversizedObservedContent.observed_content)).toHaveLength(8193);
    expect(() =>
      invokeExternalExtension(admitted, activation, oversizedObservedContent, authority),
    ).toThrow(ExternalExtensionAdmissionError);
  });

  it("normalizes a hostile policy resolver accessor during admission", () => {
    const coreAuthority = new PinnedExternalExtensionAuthority([catalog], receipts, [activePolicy]);
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

  it("normalizes revoked capability-list proxies at the admission boundary", () => {
    const authority = new PinnedExternalExtensionAuthority([catalog], receipts, [activePolicy]);
    const hostileDescriptor = descriptor();
    const { proxy, revoke } = Proxy.revocable([], {});
    revoke();
    hostileDescriptor.required_network_capabilities = proxy as string[];

    expect(() => admitExternalExtension(hostileDescriptor, authority)).toThrow(
      ExternalExtensionAdmissionError,
    );
  });
});