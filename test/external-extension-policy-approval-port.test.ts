import { describe, expect, it } from "vitest";

import {
  ExternalExtensionAdmissionError,
  PinnedExternalExtensionAuthority,
  activateExternalExtension,
  admitExternalExtension,
  invokeExternalExtension,
  type ExternalExtensionAuthority,
  type ExternalExtensionDescriptor,
  type ExternalExtensionInvocationRequest,
  type TrustedExtensionCatalogEntry,
  type TrustedExtensionPolicyApproval,
  type TrustedExtensionScanReceipt,
} from "../src/tool-capability/external-extension-admission";
import { activateExternalExtension as activateCoreExtension } from "../src/tool-capability/internal/external-extension-admission-core";

const COMMIT = "a".repeat(40);
const ARTIFACT = "b".repeat(64);
const MARKETPLACE = "c".repeat(64);
const ISOLATION = "urn:cwl:noema:isolation_profile:developer-assist-v1";
const EGRESS = "urn:cwl:noema:egress_policy:deny-unreviewed-v1";
const POLICY = "urn:cwl:noema:external_extension_activation:developer-assist-v1";
const VALID_FROM = "2026-09-01T00:00:00.000Z";
const VALID_TO = "2026-12-01T00:00:00.000Z";
const APPGUARDRAIL_PROFILE = "urn:cwl:appguardrail:claude_plugin_scan:policy-v1";
const APPGUARDRAIL_PROFILE_SHA256 = "d".repeat(64);
const QUARANTINE_PROFILE = "urn:cwl:quarantine:claude_plugin_package_analysis:profile-v1";
const QUARANTINE_PROFILE_SHA256 = "e".repeat(64);

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
  appguardrail_policy_profile_id: APPGUARDRAIL_PROFILE,
  appguardrail_policy_profile_sha256: APPGUARDRAIL_PROFILE_SHA256,
  quarantine_policy_profile_id: QUARANTINE_PROFILE,
  quarantine_policy_profile_sha256: QUARANTINE_PROFILE_SHA256,
  ...overrides,
});

const pinned = (
  approvals?: readonly TrustedExtensionPolicyApproval[],
  catalogEntry: TrustedExtensionCatalogEntry = catalog(),
  scanReceipts: readonly TrustedExtensionScanReceipt[] = receipts,
) =>
  approvals === undefined
    ? new PinnedExternalExtensionAuthority([catalogEntry], scanReceipts)
    : new PinnedExternalExtensionAuthority([catalogEntry], scanReceipts, approvals);

const activationRequest = (policyVersion = POLICY) => ({
  activation_id: "activation-rust-01",
  product_repository: "ContextualWisdomLab/fast-mlsirm",
  execution_role: "maintainer_review",
  execution_mode: "developer_assist" as const,
  policy_version: policyVersion,
  activated_at: "2026-09-08T06:00:00.000Z",
});

const invocationRequest = (
  overrides: Partial<ExternalExtensionInvocationRequest> = {},
) => ({
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
  ...overrides,
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
  it("keeps the source-issued grant at the pilot ceiling until active authority is explicit", () => {
    expect(() => admitExternalExtension(descriptor(), pinned())).toThrow(
      /policy approval authority is required before admission/,
    );

    const pilot = admitExternalExtension(
      descriptor({ approval_status: "approved_for_pilot" }),
      pinned(),
    );
    expect(pilot.descriptor.approval_status).toBe("approved_for_pilot");

    const explicitlyActive = admitExternalExtension(descriptor(), pinned([policy()]));
    expect(explicitlyActive.descriptor.approval_status).toBe("active");
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
      const matchingScanReceipts = receipts.map((receipt) => ({
        ...receipt,
        policy_version: candidate.isolation_profile_reference,
      }));
      expect(() =>
        admitExternalExtension(candidate, pinned(undefined, catalog(), matchingScanReceipts)),
      ).toThrow(/policy approval authority is required before admission/);
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

    const malformedAuthority: ExternalExtensionAuthority = {
      ...base,
      resolvePolicyApproval: () => policy({ max_approval_status: "invalid" as "active" }),
    };
    expect(() => admitExternalExtension(descriptor(), malformedAuthority)).toThrow(
      /trusted policy approval fields are malformed/,
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
    const authority = pinned([policy()]);
    const admitted = admitExternalExtension(descriptor(), authority);

    expect(() =>
      activateExternalExtension(admitted, activationRequest("urn:cwl:noema:wrong_policy:v1")),
    ).toThrow(/activation policy_version is not issued by Noema Policy \/ Approval/);
    expect(activateExternalExtension(admitted, activationRequest()).kind).toBe("accepted");
  });

  it("re-resolves policy drift and revocation before issuing an activation", () => {
    const base = coreOnlyAuthority();
    let current: TrustedExtensionPolicyApproval | null = policy();
    const mutableAuthority: ExternalExtensionAuthority = {
      ...base,
      resolvePolicyApproval: () => current,
    };
    const admitted = admitExternalExtension(descriptor(), mutableAuthority);

    current = policy({ allowed_execution_roles: ["maintainer_review", "security_review"] });
    expect(() => activateExternalExtension(admitted, activationRequest())).toThrow(
      /policy approval changed or was revoked after admission/,
    );

    current = null;
    expect(() => activateExternalExtension(admitted, activationRequest())).toThrow(
      /policy approval authority is required before admission/,
    );
  });

  it("re-resolves policy on invocation through the admission-bound authority", async () => {
    const base = coreOnlyAuthority();
    let current: TrustedExtensionPolicyApproval | null = policy();
    const mutableAuthority: ExternalExtensionAuthority = {
      ...base,
      resolvePolicyApproval: () => current,
    };
    const admitted = admitExternalExtension(descriptor(), mutableAuthority);
    const activation = activateExternalExtension(admitted, activationRequest()).activation;

    current = null;
    expect(() =>
      invokeExternalExtension(admitted, activation, invocationRequest(), mutableAuthority),
    ).toThrow(/policy approval authority is required before admission/);

    current = policy({ allowed_execution_roles: ["maintainer_review", "security_review"] });
    expect(() =>
      invokeExternalExtension(admitted, activation, invocationRequest(), mutableAuthority),
    ).toThrow(/policy approval changed or was revoked after admission/);

    current = policy();
    const forgedPolicyActivation = Object.freeze({
      ...activation,
      policy_version: "urn:cwl:noema:wrong_policy:v1",
    });
    expect(() =>
      invokeExternalExtension(
        admitted,
        forgedPolicyActivation,
        invocationRequest(),
        mutableAuthority,
      ),
    ).toThrow(/activation policy_version is not issued by Noema Policy \/ Approval/);

    expect(
      (await invokeExternalExtension(admitted, activation, invocationRequest(), mutableAuthority)).kind,
    ).toBe("accepted");
  });

  it("rejects an invocation timestamp that predates its issued activation", () => {
    const authority = pinned([policy()]);
    const admitted = admitExternalExtension(descriptor(), authority);
    const activation = activateExternalExtension(admitted, activationRequest()).activation;

    expect(() =>
      invokeExternalExtension(
        admitted,
        activation,
        invocationRequest({ invoked_at: "2026-09-08T05:59:59.999Z" }),
        authority,
      ),
    ).toThrow(/invocation cannot predate its activation/);
  });

  it("uses the domain error type for policy-boundary rejection", () => {
    expect(() => admitExternalExtension(descriptor(), pinned([]))).toThrow(
      ExternalExtensionAdmissionError,
    );
  });

  it("keeps the internal core fail-closed against structural admission forgery", () => {
    expect(() =>
      activateCoreExtension({} as ReturnType<typeof admitExternalExtension>, activationRequest()),
    ).toThrow(/admission authority is not trusted/);
  });
});
