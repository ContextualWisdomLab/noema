import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../src/index";

const env: Env = {
  ALLOWED_ISSUER: "https://token.actions.githubusercontent.com",
  ALLOWED_AUDIENCE: "cwl-noema-review",
  ALLOWED_REPOSITORY_OWNER: "ContextualWisdomLab",
  ALLOWED_WORKFLOW_REPOSITORY: "ContextualWisdomLab/.github",
  ALLOWED_WORKFLOW_REF_PREFIX: "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main",
  ALLOWED_WORKFLOW_SHA: "a".repeat(40),
  GITHUB_API_BASE: "https://api.github.com",
  GITHUB_APP_ID: "1",
  GITHUB_APP_PRIVATE_KEY_PEM: "unused",
  NOEMA_RATE_LIMIT_PER_MINUTE: "1000",
};

function encodeSegment(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function encodeBytes(bytes: ArrayBuffer): string {
  return Buffer.from(bytes).toString("base64url");
}

function payloadWithInvalidUtf8(value: Record<string, unknown>): Uint8Array {
  const marker = "__INVALID_UTF8__";
  const serialized = Buffer.from(JSON.stringify({ ...value, padding: marker }), "utf8");
  const markerBytes = Buffer.from(marker, "utf8");
  const offset = serialized.indexOf(markerBytes);
  if (offset < 0) throw new Error("invalid UTF-8 marker missing from fixture");
  return Buffer.concat([
    serialized.subarray(0, offset),
    Buffer.from([0xff]),
    serialized.subarray(offset + markerBytes.length),
  ]);
}

function payloadWithUtf8Bom(value: Record<string, unknown>): Uint8Array {
  return Buffer.concat([
    Buffer.from([0xef, 0xbb, 0xbf]),
    Buffer.from(JSON.stringify(value), "utf8"),
  ]);
}

async function createSignedJwtWithRawPayload(payloadBytes: Uint8Array) {
  const keyPair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const kid = `oidc-invalid-utf8-${crypto.randomUUID()}`;
  const header = encodeSegment({ alg: "RS256", kid, typ: "JWT" });
  const body = Buffer.from(payloadBytes).toString("base64url");
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    keyPair.privateKey,
    new TextEncoder().encode(`${header}.${body}`),
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  return {
    token: `${header}.${body}.${encodeBytes(signature)}`,
    jwk: { ...publicJwk, kid, kty: "RSA" },
  };
}

function oidcPayload(now: number): Record<string, unknown> {
  return {
    iss: env.ALLOWED_ISSUER,
    aud: env.ALLOWED_AUDIENCE,
    repository_owner: env.ALLOWED_REPOSITORY_OWNER,
    repository_owner_id: "295022177",
    repository: "ContextualWisdomLab/.github",
    repository_id: "1274066402",
    job_workflow_ref: env.ALLOWED_WORKFLOW_REF_PREFIX,
    job_workflow_sha: env.ALLOWED_WORKFLOW_SHA,
    sub: "repo:ContextualWisdomLab/.github:ref:refs/heads/main",
    exp: now + 300,
    nbf: now - 30,
    iat: now - 30,
  };
}

async function exchangeSignedPayload(payloadBytes: Uint8Array): Promise<Response> {
  const { token, jwk } = await createSignedJwtWithRawPayload(payloadBytes);

  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url === "https://token.actions.githubusercontent.com/.well-known/openid-configuration") {
      return Response.json({ jwks_uri: "https://token.actions.githubusercontent.com/.well-known/jwks" });
    }
    if (url === "https://token.actions.githubusercontent.com/.well-known/jwks") {
      return Response.json({ keys: [jwk] });
    }
    return new Response("unexpected external request", { status: 500 });
  });

  return worker.fetch(new Request("https://noema.example/exchange", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ target_repository: 42 }),
  }), env);
}

describe("OIDC UTF-8 canonicality", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects a correctly signed JWT whose payload is not valid UTF-8", async () => {
    const response = await exchangeSignedPayload(
      payloadWithInvalidUtf8(oidcPayload(Math.floor(Date.now() / 1000))),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_TOKEN_MALFORMED",
    });
  });

  it("rejects a correctly signed JWT whose payload starts with a UTF-8 BOM before verification", async () => {
    const response = await exchangeSignedPayload(
      payloadWithUtf8Bom(oidcPayload(Math.floor(Date.now() / 1000))),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_AUTH_MISSING",
    });
  });
});
