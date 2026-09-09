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

async function platformSha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("external extension invocation replay digest", () => {
  it("is versioned, domain-separated, fixed-width, and retains no plaintext sentinel", async () => {
    const digest = await digestExternalExtensionInvocationEnvelope(request());

    expect(digest).toBe(
      "noema.external_extension.invocation_envelope:v1:sha256:5f80b062a9b0d757e2c48495f4c50f9abaf1d5b6341acd7b2c4ab85be4b07a82",
    );
    expect(digest).not.toContain(SENTINEL);
    expect(digest).not.toContain("Review");
  });

  it("changes for every semantic invocation field", async () => {
    const original = request();
    const originalDigest = await digestExternalExtensionInvocationEnvelope(original);
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
      expect(await digestExternalExtensionInvocationEnvelope(variant)).not.toBe(originalDigest);
    }
  });

  it("is deterministic regardless of caller object insertion order", async () => {
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

    expect(await digestExternalExtensionInvocationEnvelope(reordered)).toBe(
      await digestExternalExtensionInvocationEnvelope(canonical),
    );
  });

  it("verifies the runtime SHA-256 provider against NIST padding and multi-block vectors", async () => {
    expect(await platformSha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(
      await platformSha256Hex(
        "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
      ),
    ).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
    expect(await platformSha256Hex("a".repeat(1_000_000))).toBe(
      "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0",
    );
  });

  it("requires the public replay boundary to retain the digest instead of plaintext JSON", () => {
    const source = readFileSync("src/tool-capability/external-extension-admission.ts", "utf8");

    expect(source).toContain("digestExternalExtensionInvocationEnvelope(normalizedRequest)");
    expect(source).not.toContain("JSON.stringify(normalizedRequest)");
    expect(source).not.toContain("requestFingerprint");
  });
});
