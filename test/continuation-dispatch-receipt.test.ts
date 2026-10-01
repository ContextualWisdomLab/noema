import {
  createPrivateKey,
  createPublicKey,
  sign as nodeSign,
  verify as nodeVerify,
} from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";

import {
  continuationRequestDigest,
  type ContinuationDispatchRequest,
} from "../src/continuation-dispatch/contract";
import {
  signContinuationReceipt,
  verifyContinuationReceipt,
  type ContinuationReceiptFields,
  type ContinuationReceiptSigningEnv,
} from "../src/continuation-dispatch/receipt";

const request: ContinuationDispatchRequest = {
  contract_version: "noema.continuation-dispatch.v1",
  dispatch_action: "noema_review_continuation",
  central_repository: "ContextualWisdomLab/.github",
  source_repository: "ContextualWisdomLab/noema",
  pull_request_number: 736,
  expected_head_sha: "a".repeat(40),
  expected_base_sha: "b".repeat(40),
  expected_base_ref: "main",
  transport_retry_attempt: 1,
};

const requestDigest = "444f21c4b7de67b163b30e7a45108340d32a4d7011000487cd177ff511a6bb62";
const identity = "d".repeat(64);
const emittedPayloadDigest = "e".repeat(64);
const receiptId = "00000000-0000-4000-8000-000000000000";
const traceId = "11111111-1111-4111-8111-111111111111";
const keyId = "noema-continuation-receipt-2026-09";
const issuedAt = 1_798_646_400;
const expiresAt = 1_798_647_000;

let privateKeyPem: string;
let publicKeyPem: string;
let otherPublicKeyPem: string;

function pem(label: "PRIVATE KEY" | "PUBLIC KEY", der: ArrayBuffer): string {
  const base64 = Buffer.from(der).toString("base64");
  const body = base64.match(/.{1,64}/gu)?.join("\n") ?? base64;
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----`;
}

function decodeBase64Url(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

beforeAll(async () => {
  expect(await continuationRequestDigest(request, { workflow_sha: "f".repeat(40) }))
    .toBe(requestDigest);
  const pair = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
  privateKeyPem = pem("PRIVATE KEY", await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  publicKeyPem = pem("PUBLIC KEY", await crypto.subtle.exportKey("spki", pair.publicKey));

  const otherPair = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
  otherPublicKeyPem = pem(
    "PUBLIC KEY",
    await crypto.subtle.exportKey("spki", otherPair.publicKey),
  );
});

function env(overrides: Partial<ContinuationReceiptSigningEnv> = {}): ContinuationReceiptSigningEnv {
  return {
    CONTINUATION_RECEIPT_SIGNING_PRIVATE_KEY_PEM: privateKeyPem,
    CONTINUATION_RECEIPT_SIGNING_KEY_ID: keyId,
    ...overrides,
  };
}

function fields(overrides: Partial<ContinuationReceiptFields> = {}): ContinuationReceiptFields {
  return {
    request,
    requestDigest,
    idempotencyIdentity: identity,
    workflowRef: "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main",
    workflowSha: "f".repeat(40),
    emittedPayloadDigest,
    dispatchResult: {
      outcome: "accepted",
      upstreamStatus: 204,
      eventType: "noema-review",
    },
    oidcLifetime: { iat: issuedAt, exp: expiresAt },
    receiptId,
    traceId,
    ...overrides,
  };
}

describe("continuation dispatch signed receipt", () => {
  it("signs the exact RFC 8785 flat receipt bytes with deterministic Ed25519", async () => {
    const receipt = await signContinuationReceipt(fields(), env());
    const expectedCanonical = JSON.stringify({
      algorithm: "Ed25519",
      central_repository: "ContextualWisdomLab/.github",
      contract_version: "noema.continuation-dispatch.v1",
      emitted_payload_digest: emittedPayloadDigest,
      event_type: "noema-review",
      expires_at: expiresAt,
      idempotency_identity: identity,
      issued_at: issuedAt,
      key_id: keyId,
      outcome: "accepted",
      pull_request_number: 736,
      receipt_id: receiptId,
      receipt_version: "noema.continuation-dispatch-receipt.v1",
      request_digest: requestDigest,
      source_base_ref: "main",
      source_base_sha: "b".repeat(40),
      source_head_sha: "a".repeat(40),
      source_repository: "ContextualWisdomLab/noema",
      trace_id: traceId,
      transport_retry_attempt: 1,
      upstream_status: 204,
      workflow_ref: "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main",
      workflow_sha: "f".repeat(40),
    });
    const privateKey = createPrivateKey(privateKeyPem);
    const publicKey = createPublicKey(publicKeyPem);
    const expectedSignature = nodeSign(null, Buffer.from(expectedCanonical), privateKey);

    expect(decodeBase64Url(receipt.signature)).toEqual(expectedSignature);
    expect(nodeVerify(
      null,
      Buffer.from(expectedCanonical),
      publicKey,
      decodeBase64Url(receipt.signature),
    )).toBe(true);
    expect((await signContinuationReceipt(fields(), env())).signature).toBe(receipt.signature);
  });

  it("verifies a signed receipt with the released public-key contract", async () => {
    const receipt = await signContinuationReceipt(fields(), env());

    await expect(verifyContinuationReceipt(receipt, publicKeyPem)).resolves.toBe(true);
    await expect(verifyContinuationReceipt(receipt, otherPublicKeyPem)).resolves.toBe(false);
  });

  it("copies issued-at and expiry from the admitted OIDC lifetime without inventing a timeout", async () => {
    const receipt = await signContinuationReceipt(fields({
      oidcLifetime: { iat: 1_798_650_001, exp: 1_798_650_777 },
    }), env());

    expect(receipt.issued_at).toBe(1_798_650_001);
    expect(receipt.expires_at).toBe(1_798_650_777);
  });

  it("preserves a valid supplementary-plane workflow ref", async () => {
    const workflowRef = "ContextualWisdomLab/.github/.github/workflows/continuation-🚀.yml@refs/heads/main";
    const receipt = await signContinuationReceipt(fields({ workflowRef }), env());

    expect(receipt.workflow_ref).toBe(workflowRef);
    await expect(verifyContinuationReceipt(receipt, publicKeyPem)).resolves.toBe(true);
  });

  it("rejects a request digest that does not bind the canonical request and workflow SHA", async () => {
    await expect(signContinuationReceipt(fields({ requestDigest: "c".repeat(64) }), env()))
      .rejects.toThrow(/request digest/i);
  });

  it.each([
    [{ outcome: "denied", upstreamStatus: 403, eventType: "noema-review" }, 403],
    [{ outcome: "denied", upstreamStatus: 404, eventType: "noema-review" }, 404],
    [{ outcome: "denied", upstreamStatus: 422, eventType: "noema-review" }, 422],
    [{ outcome: "indeterminate", eventType: "noema-review" }, null],
    [{ outcome: "indeterminate", upstreamStatus: 503, eventType: "noema-review" }, 503],
  ] as const)("signs the terminal dispatch result %j without retry authority", async (dispatchResult, status) => {
    const receipt = await signContinuationReceipt(fields({ dispatchResult }), env());

    expect(receipt.outcome).toBe(dispatchResult.outcome);
    expect(receipt.upstream_status).toBe(status);
    await expect(verifyContinuationReceipt(receipt, publicKeyPem)).resolves.toBe(true);
  });

  it.each([
    [null, /result/i],
    [{ outcome: "accepted", eventType: "noema-review" }, /outcome/i],
    [{ outcome: "accepted", upstreamStatus: 204, eventType: "strix-scan" }, /event type/i],
    [{ outcome: "accepted", upstreamStatus: 204, eventType: "noema-review", token: "secret" }, /members/i],
    [{ outcome: "denied", upstreamStatus: 401, eventType: "noema-review" }, /outcome/i],
    [{ outcome: "indeterminate", upstreamStatus: 99, eventType: "noema-review" }, /outcome/i],
    [{ outcome: "indeterminate", upstreamStatus: 600, eventType: "noema-review" }, /outcome/i],
    [{ outcome: "indeterminate", upstreamStatus: 503.5, eventType: "noema-review" }, /outcome/i],
  ])("rejects a dispatch result outside the fixed adapter contract: %j", async (dispatchResult, message) => {
    await expect(signContinuationReceipt(fields({
      dispatchResult: dispatchResult as ContinuationReceiptFields["dispatchResult"],
    }), env())).rejects.toThrow(message);
  });

  it.each([
    [{ iat: issuedAt, exp: issuedAt }, "ordered"],
    [{ iat: issuedAt, exp: issuedAt - 1 }, "ordered"],
    [{ iat: issuedAt + 0.5, exp: expiresAt }, "integer"],
    [{ iat: issuedAt, exp: Number.POSITIVE_INFINITY }, "integer"],
  ])("rejects an OIDC lifetime that is not a canonical positive interval: %j", async (oidcLifetime, _label) => {
    await expect(signContinuationReceipt(fields({ oidcLifetime }), env()))
      .rejects.toThrow(/OIDC lifetime/i);
  });

  it.each([
    ["outcome", { outcome: "denied" }],
    ["request digest", { request_digest: "0".repeat(64) }],
    ["expiry", { expires_at: expiresAt + 1 }],
    ["event", { event_type: "strix-scan" }],
    ["unknown member", { unexpected: "authority" }],
  ])("fails verification after %s mutation", async (_label, mutation) => {
    const receipt = await signContinuationReceipt(fields(), env());
    const mutated = { ...receipt, ...mutation };

    await expect(verifyContinuationReceipt(mutated, publicKeyPem)).resolves.toBe(false);
  });

  it.each([
    ["algorithm", { algorithm: "ES256" }],
    ["central repository", { central_repository: "ContextualWisdomLab/noema" }],
    ["contract version", { contract_version: "noema.continuation-dispatch.v2" }],
    ["receipt version", { receipt_version: "noema.continuation-dispatch-receipt.v2" }],
    ["payload digest type", { emitted_payload_digest: 7 }],
    ["payload digest shape", { emitted_payload_digest: "0" }],
    ["event type", { event_type: "arbitrary-event" }],
    ["issued-at type", { issued_at: "now" }],
    ["expiry type", { expires_at: "later" }],
    ["issued-at sign", { issued_at: 0 }],
    ["expiry order", { expires_at: issuedAt }],
    ["idempotency type", { idempotency_identity: 8 }],
    ["idempotency shape", { idempotency_identity: "0" }],
    ["key-id type", { key_id: 9 }],
    ["key-id shape", { key_id: "bad key" }],
    ["outcome", { outcome: "unknown" }],
    ["PR type", { pull_request_number: "736" }],
    ["PR sign", { pull_request_number: 0 }],
    ["receipt-id type", { receipt_id: 1 }],
    ["receipt-id shape", { receipt_id: "receipt" }],
    ["request-digest type", { request_digest: 2 }],
    ["request-digest shape", { request_digest: "digest" }],
    ["base-ref type", { source_base_ref: 3 }],
    ["base-ref empty", { source_base_ref: "" }],
    ["base-SHA type", { source_base_sha: 4 }],
    ["base-SHA shape", { source_base_sha: "b" }],
    ["head-SHA type", { source_head_sha: 5 }],
    ["head-SHA shape", { source_head_sha: "a" }],
    ["source repository", { source_repository: 6 }],
    ["trace type", { trace_id: 7 }],
    ["trace shape", { trace_id: "bad trace" }],
    ["retry attempt", { transport_retry_attempt: 3 }],
    ["workflow-ref type", { workflow_ref: 8 }],
    ["workflow-ref shape", { workflow_ref: "bad\nref" }],
    ["workflow-SHA type", { workflow_sha: 9 }],
    ["workflow-SHA shape", { workflow_sha: "f" }],
  ])("fails closed when the signed %s schema is malformed", async (_label, mutation) => {
    const receipt = await signContinuationReceipt(fields(), env());

    await expect(verifyContinuationReceipt({ ...receipt, ...mutation }, publicKeyPem))
      .resolves.toBe(false);
  });

  it("rejects outcome/status combinations that are impossible for the fixed adapter", async () => {
    const accepted = await signContinuationReceipt(fields(), env());
    const denied = await signContinuationReceipt(fields({
      dispatchResult: { outcome: "denied", upstreamStatus: 403, eventType: "noema-review" },
    }), env());
    const indeterminate = await signContinuationReceipt(fields({
      dispatchResult: { outcome: "indeterminate", eventType: "noema-review" },
    }), env());

    for (const candidate of [
      { ...accepted, upstream_status: 200 },
      { ...denied, upstream_status: 401 },
      { ...indeterminate, upstream_status: "503" },
      { ...indeterminate, upstream_status: 99 },
      { ...indeterminate, upstream_status: 600 },
    ]) {
      await expect(verifyContinuationReceipt(candidate, publicKeyPem)).resolves.toBe(false);
    }
  });

  it("returns a credential-free receipt and rejects secret-shaped input members", async () => {
    const signingEnv = env();
    const receipt = await signContinuationReceipt(fields(), signingEnv);
    const serialized = JSON.stringify(receipt);

    expect(serialized).not.toContain(signingEnv.CONTINUATION_RECEIPT_SIGNING_PRIVATE_KEY_PEM);
    expect(serialized).not.toMatch(/token|bearer|assertion|private[_-]?key/iu);

    for (const secretMember of ["token", "bearer", "assertion", "private_key"] as const) {
      await expect(signContinuationReceipt({
        ...fields(),
        [secretMember]: "must-not-cross",
      } as ContinuationReceiptFields, signingEnv)).rejects.toThrow(/members/i);
    }
  });

  it("uses only the dedicated bindings when the Worker passes its composite environment", async () => {
    const receipt = await signContinuationReceipt(fields(), {
      ...env(),
      GITHUB_API_BASE: "https://api.github.com",
      GITHUB_APP_PRIVATE_KEY_PEM: "must-not-cross",
    } as ContinuationReceiptSigningEnv);

    expect(receipt.key_id).toBe(keyId);
    expect(JSON.stringify(receipt)).not.toContain("must-not-cross");
  });

  it.each([
    [() => null, () => env(), /fields/i],
    [() => [], () => env(), /fields/i],
    [() => fields(), () => null, /environment/i],
    [() => ({ ...fields(), requestDigest: "0" }), () => env(), /request identity/i],
    [() => ({ ...fields(), idempotencyIdentity: "0" }), () => env(), /request identity/i],
    [() => ({ ...fields(), emittedPayloadDigest: "0" }), () => env(), /payload digest/i],
    [() => ({ ...fields(), workflowRef: 8 }), () => env(), /workflow ref/i],
    [() => ({ ...fields(), workflowRef: "bad ref" }), () => env(), /workflow ref/i],
    [() => ({ ...fields(), workflowRef: "valid\ud800" }), () => env(), /workflow ref/i],
    [() => ({ ...fields(), workflowRef: "valid\udc00" }), () => env(), /workflow ref/i],
    [() => ({ ...fields(), receiptId: "receipt" }), () => env(), /receipt or trace/i],
    [() => ({ ...fields(), traceId: "bad trace" }), () => env(), /receipt or trace/i],
  ])("rejects non-canonical signing input", async (fieldsFactory, envFactory, message) => {
    await expect(signContinuationReceipt(
      fieldsFactory() as ContinuationReceiptFields,
      envFactory() as ContinuationReceiptSigningEnv,
    )).rejects.toThrow(message);
  });

  it.each(["", " key", "key ", "key\nline", "\u0000key", ["key"]])(
    "rejects a non-canonical signing key id %j",
    async (candidate) => {
      await expect(signContinuationReceipt(fields(), env({
        CONTINUATION_RECEIPT_SIGNING_KEY_ID: candidate,
      }))).rejects.toThrow(/key id/i);
    },
  );

  it("rejects a non-PKCS8 signing key and fails closed for a non-SPKI verification key", async () => {
    await expect(signContinuationReceipt(fields(), env({
      CONTINUATION_RECEIPT_SIGNING_PRIVATE_KEY_PEM: publicKeyPem,
    }))).rejects.toThrow(/private key/i);
    await expect(verifyContinuationReceipt(
      await signContinuationReceipt(fields(), env()),
      privateKeyPem,
    )).resolves.toBe(false);

    await expect(signContinuationReceipt(fields(), env({
      CONTINUATION_RECEIPT_SIGNING_PRIVATE_KEY_PEM: publicKeyPem
        .replaceAll("PUBLIC KEY", "PRIVATE KEY"),
    }))).rejects.toThrow(/private key or operation/i);
    await expect(verifyContinuationReceipt(
      await signContinuationReceipt(fields(), env()),
      privateKeyPem.replaceAll("PRIVATE KEY", "PUBLIC KEY"),
    )).resolves.toBe(false);
  });

  it("fails closed for malformed PEM and detached-signature encodings", async () => {
    const receipt = await signContinuationReceipt(fields(), env());
    const malformedPem = "-----BEGIN PUBLIC KEY-----\nAA\n-----END PUBLIC KEY-----";
    const invalidPaddedPem = "-----BEGIN PUBLIC KEY-----\nA===\n-----END PUBLIC KEY-----";

    await expect(verifyContinuationReceipt(receipt, null as unknown as string)).resolves.toBe(false);
    await expect(verifyContinuationReceipt(receipt, malformedPem)).resolves.toBe(false);
    await expect(verifyContinuationReceipt(receipt, invalidPaddedPem)).resolves.toBe(false);
    await expect(verifyContinuationReceipt(null, publicKeyPem)).resolves.toBe(false);
    await expect(verifyContinuationReceipt({ ...receipt, signature: 1 }, publicKeyPem)).resolves.toBe(false);
    await expect(verifyContinuationReceipt({ ...receipt, signature: "=" }, publicKeyPem)).resolves.toBe(false);
    await expect(verifyContinuationReceipt({ ...receipt, signature: "A" }, publicKeyPem)).resolves.toBe(false);
    await expect(verifyContinuationReceipt({ ...receipt, signature: "_x" }, publicKeyPem)).resolves.toBe(false);
  });
});
