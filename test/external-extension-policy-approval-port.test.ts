import { describe, expect, it } from "vitest";

import {
  ExternalExtensionAdmissionError,
  PinnedExternalExtensionAuthority,
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
const VALID_FROM = "2026-09-01T00:00:00.000Z";
const VALID_TO = "2026-12-01T00:00:00.000Z";

const descriptor = (
  overrides: Partial<ExternalExtensionDescriptor> = {},
): ExternalExtensionDescriptor => ({
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
  ...overrides,
});

const catalog = (
  overrides: Partial<TrustedExtensionCatalogEntry> = {},
): TrustedExtensionCatalogEntry => ({
  external_extension_id: "rust_review_guidance",
  upstream_repository: "anthropics/claude-plugins-community",
  upstream_commit_sha: COMMIT,
  upstream_path: "plugins/rust-best-practices",
  artifact_sha256: ARTIFACT,
  marketplace_entry_sha256: MARKETPLACE,
  ...overrides,
});

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

const policy = (
  overrides: Partial<TrustedExtensionPolicyApproval> = {},
): TrustedExtensionPolicyApproval => ({
  external_extension_id: "rust_review_guidance",
  max_approval_status: "active",
  allowed_product_repositories: ["ContextualWisdomLab/fast-mlsirm"],
  allowed_execution_roles: ["maintainer_review"],
  valid_from: VALID_FROM,
  valid_to: VALID_TO,
  isolation_profile_reference: ISOLATION,
  egress_policy_reference: EGRESS,
  activation_policy_version: POLICY,
  ...overrides,
});

const pinned = (
  approvals?: readonly TrustedExtensionPolicyApproval[],
  catalogEntry: TrustedExtensionCatalogEntry = catalog(),
) =>
  approvals === undefined
    ? new PinnedExternalExtensionAuthority([catalogEntry], receipts)
    : new PinnedExternalExtensionAuthority([catalogEntry], receipts, approvals);

const activationRequest = (policyVersion = POLICY) => ({
  activation_id: "activation-rust-01",
  product_repository: "ContextualWisdomLab/fast-mlsirm",
  execution_role: "maintainer_review",
  execution_mode: "developer_assist" as const,
  policy_version: policyVersion,
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

const coreOnlyAuthority = (
  catalogEntry: TrustedExtensionCatalogEntry = catalog(),
): ExternalExtensionAuthority => {
  const authority = pinned(undefined, catalogEntry);
  return {
    resolveCatalog: (extensionId) => authority.resolveCatalog(extensionId),
    resolveScanReceipt: (receiptId) => authority.resolveScanReceipt(receiptId),
  };
};

describe("Noema external-extension policy approval authority", () => {
  it("admits the source-issued pilot grant and a non-escalating pilot state", () => {
    const active = admitExternalExtension(descriptor(), pinned());
    const pilot = admitExternalExtension(
      descriptor({ approval_status: "approved_for_pilot" }),
      pinned(),
    );

    expect(active.descriptor.approval_status).toBe("active");
    expect(pilot.descriptor.approval_status).toBe("approved_for_pilot");
  });

  it("requires an issued policy grant instead of trusting descriptor fields", () => {
    expect(() => admitExternalExtension(descriptor(), pinned([]))).toThrow(
      /policy approval authority is required before admission/,
    );
  });

  it("rejects product, role, validity, isolation, egress, and status escalation", () => {
    const cases: ExternalExtensionDescriptor[] = [
      descriptor({ allowed_product_repositories: ["ContextualWisdomLab/noema"] }),
      descriptor({ allowed_execution_roles: ["release_operator"] }),
      descriptor({ valid_from: "2026-08-31T23:59:59.999Z" }),
      descriptor({ valid_to: "2026-12-01T00:00:00.001Z" }),
      descriptor({ isolation_profile_reference: "urn:cwl:noema:isolation_profile:other-v1" }),
      descriptor({ egress_policy_reference: "urn:cwl:noema:egress_policy:other-v1" }),
    ];
    for (const candidate of cases) {
      expect(() => admitExternalExtension(candidate, pinned())).toThrow(
        /policy approval authority is required before admission/,
      );
    }

    const pilotOnly = pinned([policy({ max_approval_status: "approved_for_pilot" })]);
    expect(() => admitExternalExtension(descriptor({ approval_status: "active" }), pilotOnly)).toThrow(
      /policy approval authority is required before admission/,
    );
    expect(
      admitExternalExtension(
        descriptor({ approval_status: "approved_for_pilot" }),
        pilotOnly,
      ).descriptor.approval_status,
    ).toBe("approved_for_pilot");
  });

  it("fails closed for an unknown extension when a core-only authority has no source issuance", () => {
    const unknownDescriptor = descriptor({
      external_extension_id: "other_review_guidance",
      capability_code: "other_review_guidance",
    });
    const unknownCatalog = catalog({ external_extension_id: "other_review_guidance" });

    expect(() =>
      admitExternalExtension(unknownDescriptor, coreOnlyAuthority(unknownCatalog)),
    ).toThrow(/policy approval authority is required before admission/);
  });

  it("normalizes missing, throwing, and hostile policy resolvers", () => {
    const base = coreOnlyAuthority();
    const missing: ExternalExtensionAuthority = {
      ...base,
      resolvePolicyApproval: () => null,
    };
    expect(() => admitExternalExtension(descriptor(), missing)).toThrow(
      /policy approval authority is required before admission/,
    );

    const throwing: ExternalExtensionAuthority = {
      ...base,
      resolvePolicyApproval: () => {
        throw new Error("policy backend unavailable");
      },
    };
    expect(() => admitExternalExtension(descriptor(), throwing)).toThrow(
      /trusted policy approval lookup failed/,
    );

    const hostile = Object.defineProperty(policy(), "allowed_product_repositories", {
      get() {
        throw new Error("hostile policy getter");
      },
    });
    const hostileAuthority: ExternalExtensionAuthority = {
      ...base,
      resolvePolicyApproval: () => hostile,
    };
    expect(() => admitExternalExtension(descriptor(), hostileAuthority)).toThrow(
      /trusted policy approval could not be read safely/,
    );
  });

  it("rejects malformed and duplicate operator policy pins", () => {
    expect(() =>
      new PinnedExternalExtensionAuthority(
        [catalog()],
        receipts,
        [null as unknown as TrustedExtensionPolicyApproval],
      ),
    ).toThrow(/trusted policy approval is malformed/);
    expect(() =>
      pinned([
        policy({ allowed_product_repositories: "repo" as unknown as readonly string[] }),
      ]),
    ).toThrow(/trusted policy approval scope is malformed/);
    expect(() =>
      pinned([
        policy({ allowed_execution_roles: [1 as unknown as string] }),
      ]),
    ).toThrow(/trusted policy approval fields are malformed/);
    expect(() =>
      pinned([
        policy({ max_approval_status: "invalid" as "active" }),
      ]),
    ).toThrow(/trusted policy approval fields are malformed/);
    expect(() =>
      pinned([
        policy({ activation_policy_version: "not-a-policy-urn" }),
      ]),
    ).toThrow(/trusted policy approval fields are malformed/);
    expect(() => pinned([policy(), policy()])).toThrow(
      /trusted policy approvals contain a duplicate extension pin/,
    );
  });

  it("binds activation policy_version to the independently issued policy", () => {
    const authority = pinned();
    const admitted = admitExternalExtension(descriptor(), authority);

    expect(() =>
      activateExternalExtension(admitted, activationRequest("urn:cwl:noema:wrong_policy:v1")),
    ).toThrow(/activation policy_version is not issued by Noema Policy \/ Approval/);
    expect(activateExternalExtension(admitted, activationRequest()).kind).toBe("accepted");
  });

  it("re-resolves policy on invocation and rejects revocation or drift", () => {
    const authority = pinned([policy()]);
    const admitted = admitExternalExtension(descriptor(), authority);
    const activation = activateExternalExtension(admitted, activationRequest()).activation;

    expect(() =>
      invokeExternalExtension(admitted, activation, invocationRequest(), pinned([])),
    ).toThrow(/policy approval authority is required before admission/);

    const drifted = pinned([
      policy({ allowed_execution_roles: ["maintainer_review", "security_review"] }),
    ]);
    expect(() =>
      invokeExternalExtension(admitted, activation, invocationRequest(), drifted),
    ).toThrow(/policy approval changed or was revoked after admission/);

    const forgedPolicyActivation = Object.freeze({
      ...activation,
      policy_version: "urn:cwl:noema:wrong_policy:v1",
    });
    expect(() =>
      invokeExternalExtension(
        admitted,
        forgedPolicyActivation,
        invocationRequest(),
        authority,
      ),
    ).toThrow(/activation policy_version is not issued by Noema Policy \/ Approval/);

    expect(
      invokeExternalExtension(admitted, activation, invocationRequest(), authority).kind,
    ).toBe("accepted");
  });

  it("uses the domain error type for policy-boundary rejection", () => {
    expect(() => admitExternalExtension(descriptor(), pinned([]))).toThrow(
      ExternalExtensionAdmissionError,
    );
  });
});
