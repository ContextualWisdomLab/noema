import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { digestExternalExtensionInvocationEnvelope } from "../src/tool-capability/internal/external-extension-invocation-digest";
import type { ExternalExtensionInvocationRequest } from "../src/tool-capability/external-extension-admission";

const SENTINEL = "NOEMA-PLAINTEXT-RETENTION-SENTINEL-7f3b0e2f";

const request = (
  overrides: Partial<ExternalExtensionInvocationRequest> = {},
): ExternalExtensionInvocationRequest => ({
  activation_id: "activation-rust-01",
  invocation_id: "invocation-rust-01",
  execution_mode: "developer_assist",
  invoked_at: "2026-09-08T06:05:00.000Z",
  instruction: `Review ${SENTINEL}`,
  observed_content: `observed:${SENTINEL}`,
  promote_observed_content: false,
  secret_material: `secret:${SENTINEL}`,
  product_record: `record:${SENTINEL}`,
  hidden_reasoning: `reasoning:${SENTINEL}`,
  ...overrides,
});

describe("external extension invocation replay digest", () => {
  it("is versioned, domain-separated, fixed-width, and retains no plaintext sentinel", () => {
    const digest = digestExternalExtensionInvocationEnvelope(request());

    expect(digest).toMatch(/^noema\.external_extension\.invocation_envelope:v1:sha256:[0-9a-f]{64}$/u);
    expect(digest).not.toContain(SENTINEL);
    expect(digest).not.toContain("Review");
  });

  it("changes for every semantic invocation field", () => {
    const original = request();
    const originalDigest = digestExternalExtensionInvocationEnvelope(original);
    const variants: ExternalExtensionInvocationRequest[] = [
      request({ activation_id: "activation-rust-02" }),
      request({ invocation_id: "invocation-rust-02" }),
      request({ execution_mode: "product_runtime" }),
      request({ invoked_at: "2026-09-08T06:05:01.000Z" }),
      request({ instruction: `${original.instruction}-changed` }),
      request({ observed_content: `${original.observed_content}-changed` }),
      request({ promote_observed_content: true }),
      request({ secret_material: `${original.secret_material}-changed` }),
      request({ product_record: `${original.product_record}-changed` }),
      request({ hidden_reasoning: `${original.hidden_reasoning}-changed` }),
    ];

    for (const variant of variants) {
      expect(digestExternalExtensionInvocationEnvelope(variant)).not.toBe(originalDigest);
    }
  });

  it("is deterministic regardless of caller object insertion order", () => {
    const canonical = request();
    const reordered = {
      hidden_reasoning: canonical.hidden_reasoning,
      product_record: canonical.product_record,
      secret_material: canonical.secret_material,
      promote_observed_content: canonical.promote_observed_content,
      observed_content: canonical.observed_content,
      instruction: canonical.instruction,
      invoked_at: canonical.invoked_at,
      execution_mode: canonical.execution_mode,
      invocation_id: canonical.invocation_id,
      activation_id: canonical.activation_id,
    } satisfies ExternalExtensionInvocationRequest;

    expect(digestExternalExtensionInvocationEnvelope(reordered)).toBe(
      digestExternalExtensionInvocationEnvelope(canonical),
    );
  });

  it("requires the public replay boundary to retain the digest instead of plaintext JSON", () => {
    const source = readFileSync("src/tool-capability/external-extension-admission.ts", "utf8");

    expect(source).toContain("digestExternalExtensionInvocationEnvelope(normalizedRequest)");
    expect(source).not.toContain("JSON.stringify(normalizedRequest)");
    expect(source).not.toContain("requestFingerprint");
  });
});
