import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../src/index";

const configuredRef =
  "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main";
const configuredWorkflowSha = "a".repeat(40);

const env: Env = {
  ALLOWED_ISSUER: "https://token.actions.githubusercontent.com",
  ALLOWED_AUDIENCE: "cwl-noema-review",
  ALLOWED_REPOSITORY_OWNER: "ContextualWisdomLab",
  ALLOWED_WORKFLOW_REPOSITORY: "ContextualWisdomLab/.github",
  ALLOWED_WORKFLOW_REF_PREFIX: configuredRef,
  ALLOWED_WORKFLOW_SHA: configuredWorkflowSha,
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

function pemFromPkcs8(pkcs8: ArrayBuffer): string {
  const base64 = Buffer.from(pkcs8).toString("base64");
  const lines = base64.match(/.{1,64}/g)?.join("\n") ?? base64;
  return `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----`;
}

async function createSignedJwt(payload: Record<string, unknown>) {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const kid = `exchange-success-${crypto.randomUUID()}`;
  const header = encodeSegment({ alg: "RS256", kid, typ: "JWT" });
  const body = encodeSegment(payload);
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe("exchange success-path coverage through the public worker", () => {
  it("accepts workflow_ref-only claims without inventing an OIDC subject", async () => {
    const now = Math.floor(Date.now() / 1000);
    const { token: oidcToken, jwk } = await createSignedJwt({
      iss: env.ALLOWED_ISSUER,
      aud: env.ALLOWED_AUDIENCE,
      repository_owner: env.ALLOWED_REPOSITORY_OWNER,
      repository: "ContextualWisdomLab/.github",
      workflow_ref: configuredRef,
      workflow_sha: configuredWorkflowSha,
      exp: now + 300,
      nbf: now - 30,
      iat: now - 30,
    });
    const appKeyPair = await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"],
    );
    const appPrivateKey = pemFromPkcs8(
      await crypto.subtle.exportKey("pkcs8", appKeyPair.privateKey),
    );
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "https://token.actions.githubusercontent.com/.well-known/openid-configuration") {
        return Response.json({
          jwks_uri: "https://token.actions.githubusercontent.com/.well-known/jwks",
        });
      }
      if (url === "https://token.actions.githubusercontent.com/.well-known/jwks") {
        return Response.json({ keys: [jwk] });
      }
      if (url === "https://api.github.com/repos/ContextualWisdomLab/noema/installation") {
        return Response.json({ id: 12345 });
      }
      if (url === "https://api.github.com/app/installations/12345/access_tokens") {
        return Response.json({
          token: "ghs_exchange_success_token",
          expires_at: "2030-01-01T00:00:00Z",
        });
      }
      return new Response("not found", { status: 404 });
    });

    const response = await worker.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: {
          authorization: `Bearer ${oidcToken}`,
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.205",
        },
        body: JSON.stringify({ target_repository: "ContextualWisdomLab/noema" }),
      }),
      {
        ...env,
        GITHUB_APP_PRIVATE_KEY_PEM: appPrivateKey,
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        token: "ghs_exchange_success_token",
        repository: "ContextualWisdomLab/noema",
        workflow_ref: configuredRef,
        token_expires_at: "2030-01-01T00:00:00Z",
      },
    });
    const logOutput = logSpy.mock.calls.flat().join("\n");
    expect(logOutput).not.toContain("ghs_exchange_success_token");
    expect(logOutput).not.toContain(oidcToken);
    expect(logOutput).not.toContain("oidc_sub");
  });
});
