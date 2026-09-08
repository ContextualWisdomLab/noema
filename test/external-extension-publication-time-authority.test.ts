import { afterEach, describe, expect, it, vi } from "vitest";

import {
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
const EGRESS = "urn:cwl:noema:egress_policy:deny-unreviewed-v1";
const POLICY = "urn:cwl:noema:external_extension_activation:developer-assist-v1";
const APPGUARDRAIL_PROFILE = "urn:cwl:appguardrail:claude_plugin_scan:policy-v1";
const APPGUARDRAIL_PROFILE_SHA256 = "d".repeat(64);
const QUARANTINE_PROFILE = "urn:cwl:quarantine:claude_plugin_package_analysis:profile-v1";
const QUARANTINE_PROFILE_SHA256 = "e".repeat(64);
const VALID_FROM = "2026-09-01T00:00:00.000Z";
const VALID_TO = "2026-12-01T00:00:00.000Z";

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
  artifact_sha256: ARTIFACT,
  marketplace_entry_sha256: MARKETPLACE,
};

const receipts: readonly TrustedExtensionScanReceipt[] = [
  {
    receipt_id: descriptor.appguardrail_scan_receipt,
    artifact_sha256: ARTIFACT,
    policy_version: ISOLATION,
    producer: "appguardrail",
    policy_profile_id: APPGUARDRAIL_PROFILE,
    policy_profile_sha256: APPGUARDRAIL_PROFILE_SHA256,
  },
  {
    receipt_id: descriptor.quarantine_analysis_receipt,
    artifact_sha256: ARTIFACT,
    policy_version: ISOLATION,
    producer: "quarantine-sandbox-runtime",
    policy_profile_id: QUARANTINE_PROFILE,
    policy_profile_sha256: QUARANTINE_PROFILE_SHA256,
  },
];

const activePolicy: TrustedExtensionPolicyApproval = {
  external_extension_id: descriptor.external_extension_id,
  max_approval_status: "active",
  allowed_product_repositories: descriptor.allowed_product_repositories,
  allowed_execution_roles: descriptor.allowed_execution_roles,
  valid_from: VALID_FROM,
  valid_to: VALID_TO,
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
  instruction: "Review the current-head change against the pinned guidance.",
  observed_content: "",
  promote_observed_content: false,
  secret_material: "",
  product_record: "",
  hidden_reasoning: "",
});

function deferredDigest(): {
  readonly promise: Promise<ArrayBuffer>;
  readonly resolve: (value: ArrayBuffer) => void;
} {
  let resolve!: (value: ArrayBuffer) => void;
  const promise = new Promise<ArrayBuffer>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

function mutableAuthority(): {
  readonly authority: ExternalExtensionAuthority;
  setPolicy(value: TrustedExtensionPolicyApproval | null): void;
  setCatalog(value: TrustedExtensionCatalogEntry | null): void;
  setReceipt(value: TrustedExtensionScanReceipt): void;
} {
  let currentPolicy: TrustedExtensionPolicyApproval | null = activePolicy;
  let currentCatalog: TrustedExtensionCatalogEntry | null = catalog;
  const currentReceipts = new Map(receipts.map((receipt) => [receipt.receipt_id, receipt]));

  return {
    authority: {
      resolveCatalog: () => currentCatalog,
      resolveScanReceipt: (receiptId) => currentReceipts.get(receiptId) ?? null,
      resolvePolicyApproval: () => currentPolicy,
    },
    setPolicy(value) {
      currentPolicy = value;
    },
    setCatalog(value) {
      currentCatalog = value;
    },
    setReceipt(value) {
      currentReceipts.set(value.receipt_id, value);
    },
  };
}

function beginPendingInvocation(authority: ExternalExtensionAuthority) {
  const admitted = admitExternalExtension(descriptor, authority);
  const activation = activateExternalExtension(admitted, activationRequest()).activation;
  const digest = deferredDigest();
  vi.stubGlobal("crypto", {
    subtle: {
      digest: () => digest.promise,
    },
  });
  const pending = invokeExternalExtension(admitted, activation, invocationRequest(), authority);
  return { digest, pending };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("external extension publication-time live authority", () => {
  it("fails closed when Policy / Approval is revoked while replay digesting is pending", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-08T06:10:00.000Z"));
    const mutable = mutableAuthority();
    const { digest, pending } = beginPendingInvocation(mutable.authority);

    mutable.setPolicy(null);
    digest.resolve(new Uint8Array(32).buffer);

    await expect(pending).rejects.toThrow(/policy approval authority is required before admission/);
  });

  it("fails closed when Policy / Approval drifts while replay digesting is pending", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-08T06:10:00.000Z"));
    const mutable = mutableAuthority();
    const { digest, pending } = beginPendingInvocation(mutable.authority);

    mutable.setPolicy({
      ...activePolicy,
      allowed_execution_roles: ["different_review_role"],
    });
    digest.resolve(new Uint8Array(32).buffer);

    await expect(pending).rejects.toThrow(/policy approval changed or was revoked after admission/);
  });

  it("fails closed when the live catalog drifts while replay digesting is pending", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-08T06:10:00.000Z"));
    const mutable = mutableAuthority();
    const { digest, pending } = beginPendingInvocation(mutable.authority);

    mutable.setCatalog({ ...catalog, marketplace_entry_sha256: "f".repeat(64) });
    digest.resolve(new Uint8Array(32).buffer);

    await expect(pending).rejects.toThrow(/trusted catalog does not match marketplace_entry_sha256/);
  });

  it("fails closed when owner-profile evidence drifts while replay digesting is pending", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-08T06:10:00.000Z"));
    const mutable = mutableAuthority();
    const { digest, pending } = beginPendingInvocation(mutable.authority);

    mutable.setReceipt({ ...receipts[0], policy_profile_sha256: "f".repeat(64) });
    digest.resolve(new Uint8Array(32).buffer);

    await expect(pending).rejects.toThrow(/scan receipt policy does not match the required owner profile/);
  });

  it("fails closed when the runtime validity window expires while replay digesting is pending", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-08T06:10:00.000Z"));
    const mutable = mutableAuthority();
    const { digest, pending } = beginPendingInvocation(mutable.authority);

    vi.setSystemTime(new Date("2026-12-02T00:00:00.000Z"));
    digest.resolve(new Uint8Array(32).buffer);

    await expect(pending).rejects.toThrow(/runtime clock is outside the approved validity window/);
  });
});
