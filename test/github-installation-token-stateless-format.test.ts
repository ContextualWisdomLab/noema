import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../src/index";

/**
 * GitHub announced that installation tokens are moving to a new stateless
 * `ghs_...` format that can be roughly 520 characters, up from the historical
 * ~40. `createInstallationToken` in `src/index.ts` validates the minted
 * token against `githubInstallationTokenPattern`, a printable-ASCII pattern
 * bounded only by an overall 1-4096 length ceiling -- it never assumes a
 * fixed or ~40-character length. This test proves that a long stateless
 * token round-trips through `/exchange` unchanged rather than being rejected
 * or truncated.
 */

const configuredWorkflowRef =
  "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main";
const configuredWorkflowSha = "a".repeat(40);
const targetRepository = "ContextualWisdomLab/installation-token-stateless-format";
const installationId = "93001";
const signingKid = "installation-token-stateless-format";

/** A ~520-character token matching GitHub's new stateless `ghs_` format. */
const statelessFormatToken = `ghs_${"A".repeat(516)}`;

/** Return a replay-guard namespace that accepts every claim, as a real first-use would. */
function acceptingReplayGuard(): DurableObjectNamespace {
  return {
    idFromName(name: string) {
      return { toString: () => name } as DurableObjectId;
    },
    get() {
      return {
        fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
          const body = JSON.parse(String(init?.body ?? "{}"));
          return Response.json(
            { accepted: true, expires_at_epoch_seconds: body.expires_at_epoch_seconds },
            { status: 201 },
          );
        },
      } as unknown as DurableObjectStub;
    },
  } as unknown as DurableObjectNamespace;
}

const env: Env = {
  ALLOWED_ISSUER: "https://token.actions.githubusercontent.com",
  ALLOWED_AUDIENCE: "cwl-noema-review",
  ALLOWED_REPOSITORY_OWNER: "ContextualWisdomLab",
  ALLOWED_WORKFLOW_REPOSITORY: "ContextualWisdomLab/.github",
  ALLOWED_WORKFLOW_REF_PREFIX: configuredWorkflowRef,
  ALLOWED_WORKFLOW_SHA: configuredWorkflowSha,
  GITHUB_API_BASE: "https://api.github.com",
  GITHUB_APP_ID: "1",
  GITHUB_APP_PRIVATE_KEY_PEM: "initialized-in-beforeAll",
  NOEMA_RATE_LIMIT_PER_MINUTE: "1000",
  NOEMA_OIDC_REPLAY_GUARD: acceptingReplayGuard(),
};

let oidcKeyPair: CryptoKeyPair;
let oidcPublicJwk: JsonWebKey;
let appPrivateKeyPem: string;

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

async function generateRsaKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
}

async function signedOidcToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = encodeSegment({ alg: "RS256", kid: signingKid, typ: "JWT" });
  const payload = encodeSegment({
    iss: env.ALLOWED_ISSUER,
    aud: env.ALLOWED_AUDIENCE,
    repository_owner: env.ALLOWED_REPOSITORY_OWNER,
    repository_owner_id: "295022177",
    repository: "ContextualWisdomLab/.github",
    repository_id: "1274066402",
    job_workflow_ref: configuredWorkflowRef,
    job_workflow_sha: configuredWorkflowSha,
    sub: "repo:ContextualWisdomLab/.github:ref:refs/heads/main",
    jti: crypto.randomUUID(),
    exp: now + 300,
    nbf: now - 30,
    iat: now - 30,
  });
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    oidcKeyPair.privateKey,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${encodeBytes(signature)}`;
}

async function exchange(clientIp: string): Promise<Response> {
  return worker.fetch(
    new Request("https://noema.example/exchange", {
      method: "POST",
      headers: {
        authorization: `Bearer ${await signedOidcToken()}`,
        "content-type": "application/json",
        "cf-connecting-ip": clientIp,
      },
      body: JSON.stringify({ target_repository: targetRepository }),
    }),
    { ...env, GITHUB_APP_PRIVATE_KEY_PEM: appPrivateKeyPem },
  );
}

beforeAll(async () => {
  oidcKeyPair = await generateRsaKeyPair();
  oidcPublicJwk = await crypto.subtle.exportKey("jwk", oidcKeyPair.publicKey);
  const appKeyPair = await generateRsaKeyPair();
  appPrivateKeyPem = pemFromPkcs8(
    await crypto.subtle.exportKey("pkcs8", appKeyPair.privateKey),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GitHub installation-token stateless format", () => {
  it("passes a ~520-character stateless-format token through /exchange unchanged", async () => {
    expect(statelessFormatToken.length).toBe(520);

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "https://token.actions.githubusercontent.com/.well-known/openid-configuration") {
        return Response.json({
          jwks_uri: "https://token.actions.githubusercontent.com/.well-known/jwks",
        });
      }
      if (url === "https://token.actions.githubusercontent.com/.well-known/jwks") {
        return Response.json({
          keys: [{ ...oidcPublicJwk, kid: signingKid, kty: "RSA" }],
        });
      }
      if (url === `https://api.github.com/repos/${targetRepository}/installation`) {
        return Response.json({ id: Number(installationId) });
      }
      if (url === `https://api.github.com/app/installations/${installationId}/access_tokens`) {
        return Response.json({
          token: statelessFormatToken,
          expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
        }, { status: 201 });
      }
      return new Response("unexpected privileged egress", { status: 500 });
    });

    const response = await exchange("203.0.113.220");

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({
      ok: true,
      data: {
        repository: targetRepository,
        token: statelessFormatToken,
      },
    });
  });
});
