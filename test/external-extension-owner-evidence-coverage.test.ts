import { describe, expect, it } from "vitest";

import {
  admitExternalExtension,
  type ExternalExtensionAuthority,
  type ExternalExtensionDescriptor,
  type TrustedExtensionCatalogEntry,
  type TrustedExtensionPolicyApproval,
  type TrustedExtensionScanReceipt,
} from "../src/tool-capability/external-extension-admission";
import {
  PinnedExternalExtensionAuthority as CorePinnedExternalExtensionAuthority,
  type TrustedExtensionScanReceipt as CoreTrustedExtensionScanReceipt,
} from "../src/tool-capability/internal/external-extension-admission-core";

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
  activation_policy_version: POLICY,
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

const appguardrailReceipt = () =>
  receipt("appguardrail", "appguard-receipt", APPGUARDRAIL_PROFILE, APPGUARDRAIL_PROFILE_SHA256);
const quarantineReceipt = () =>
  receipt(
    "quarantine-sandbox-runtime",
    "quarantine-receipt",
    QUARANTINE_PROFILE,
    QUARANTINE_PROFILE_SHA256,
  );

const authorityWithSecondAppGuardrailLookup = (
  mutate: (value: TrustedExtensionScanReceipt) => TrustedExtensionScanReceipt | null | "throw",
): ExternalExtensionAuthority => {
  let appguardrailReads = 0;
  return {
    resolveCatalog: () => catalog,
    resolvePolicyApproval: () => policy,
    resolveScanReceipt(receiptId) {
      const base = receiptId === "appguard-receipt" ? appguardrailReceipt() : quarantineReceipt();
      if (receiptId !== "appguard-receipt") return base;
      appguardrailReads += 1;
      if (appguardrailReads === 1) return base;
      const next = mutate(base);
      if (next === "throw") throw new Error("owner evidence backend failed");
      return next;
    },
  };
};

describe("external extension owner evidence revalidation coverage", () => {
  it.each([
    ["lookup failure", () => "throw" as const, /trusted scan receipt lookup failed/],
    ["revocation", () => null, /trusted scan receipt is missing/],
    [
      "producer drift",
      (value: TrustedExtensionScanReceipt) => ({
        ...value,
        producer: "quarantine-sandbox-runtime" as const,
      }),
      /scan receipt producer does not match the required owner/,
    ],
    [
      "artifact drift",
      (value: TrustedExtensionScanReceipt) => ({ ...value, artifact_sha256: "f".repeat(64) }),
      /scan receipt artifact does not match the extension/,
    ],
    [
      "isolation-envelope drift",
      (value: TrustedExtensionScanReceipt) => ({
        ...value,
        policy_version: "urn:cwl:noema:isolation_profile:other-v1",
      }),
      /scan receipt isolation envelope does not match the extension/,
    ],
  ])("fails closed on %s after core admission", (_label, mutate, expected) => {
    expect(() =>
      admitExternalExtension(
        descriptor,
        authorityWithSecondAppGuardrailLookup(mutate as (value: TrustedExtensionScanReceipt) => TrustedExtensionScanReceipt | null | "throw"),
      ),
    ).toThrow(expected);
  });
});

describe("external extension internal receipt registry coverage", () => {
  const coreReceipt: CoreTrustedExtensionScanReceipt = {
    receipt_id: "appguard-receipt",
    artifact_sha256: ARTIFACT,
    policy_version: ISOLATION,
    producer: "appguardrail",
  };

  it("rejects malformed and untrusted core receipt pins", () => {
    expect(() =>
      new CorePinnedExternalExtensionAuthority(
        [catalog],
        [null as unknown as CoreTrustedExtensionScanReceipt],
      ),
    ).toThrow(/scan receipt must be an object/);
    expect(() =>
      new CorePinnedExternalExtensionAuthority(
        [catalog],
        [{ ...coreReceipt, producer: "unknown" as "appguardrail" }],
      ),
    ).toThrow(/scan receipt producer is not trusted/);
  });

  it("rejects duplicate core receipt pins and resolves present versus absent ids", () => {
    expect(() =>
      new CorePinnedExternalExtensionAuthority([catalog], [coreReceipt, coreReceipt]),
    ).toThrow(/trusted scan receipts contain a duplicate receipt pin/);

    const authority = new CorePinnedExternalExtensionAuthority([catalog], [coreReceipt]);
    expect(authority.resolveScanReceipt(coreReceipt.receipt_id)).toEqual(coreReceipt);
    expect(authority.resolveScanReceipt("missing-receipt")).toBeNull();
  });
});
