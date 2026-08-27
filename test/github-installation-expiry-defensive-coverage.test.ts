import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../src/index";

const configuredRef = "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main";
const configuredWorkflowSha = "a".repeat(40);
const expectedRepositoryOwnerId = "295022177";
const expectedWorkflowRepositoryId = "1274066402";
const canonicalSubject = "repo:ContextualWisdomLab/.github:ref:refs/heads/main";
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
  return `-----BEGIN PRIVATE KEY-----\n${base64.match(/.{1,64}/g)?.join("\n") ?? base64}\n-----END PRIVATE KEY-----`;
}
async function generateRsaKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
}

const baseEnv: Env = {
  ALLOWED_ISSUER: "https://token.actions.githubusercontent.com",
  ALLOWED_AUDIENCE: "cwl-noema-review",
  ALLOWED_REPOSITORY_OWNER: "ContextualWisdomLab",
  ALLOWED_WORKFLOW_REPOSITORY: "ContextualWisdomLab/.github",
  ALLOWED_WORKFLOW_REF_PREFIX: configuredRef,
  ALLOWED_WORKFLOW_SHA: configuredWorkflowSha,
  GITHUB_API_BASE: "https://api.github.com",
  GITHUB_APP_ID: "1",
  GITHUB_APP_PRIVATE_KEY_PEM: "initialized-in-beforeAll",
  GITHUB_APP_INSTALLATION_ID: "92345",
  NOEMA_RATE_LIMIT_PER_MINUTE: "1000",
};

beforeAll(async () => {
  oidcKeyPair = await generateRsaKeyPair();
  oidcPublicJwk = await crypto.subtle.exportKey("jwk", oidcKeyPair.publicKey);
  const appKeyPair = await generateRsaKeyPair();
  appPrivateKeyPem = pemFromPkcs8(await crypto.subtle.exportKey("pkcs8", appKeyPair.privateKey));
});
afterEach(() => vi.restoreAllMocks());

async function exchangeWithTokenResponse(tokenBody: unknown, clientIp: string): Promise<Response> {
  const kid = `github-expiry-${crypto.randomUUID()}`;
  const now = Math.floor(Date.now() / 1000);
  const header = encodeSegment({ alg: "RS256", kid, typ: "JWT" });
  const payload = encodeSegment({ iss: baseEnv.ALLOWED_ISSUER, aud: baseEnv.ALLOWED_AUDIENCE, repository_owner: baseEnv.ALLOWED_REPOSITORY_OWNER, repository_owner_id: expectedRepositoryOwnerId, repository: "ContextualWisdomLab/.github", repository_id: expectedWorkflowRepositoryId, job_workflow_ref: configuredRef, job_workflow_sha: configuredWorkflowSha, sub: canonicalSubject, exp: now + 300, nbf: now - 30, iat: now - 30 });
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", oidcKeyPair.privateKey, new TextEncoder().encode(`${header}.${payload}`));
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith("/.well-known/openid-configuration")) return Response.json({ jwks_uri: "https://token.actions.githubusercontent.com/.well-known/jwks" });
    if (url.endsWith("/.well-known/jwks")) return Response.json({ keys: [{ ...oidcPublicJwk, kid, kty: "RSA" }] });
    if (url === "https://api.github.com/app/installations/92345/access_tokens") return Response.json(tokenBody);
    return new Response("unexpected", { status: 500 });
  });
  return worker.fetch(new Request("https://noema.example/exchange", { method: "POST", headers: { authorization: `Bearer ${header}.${payload}.${encodeBytes(signature)}`, "content-type": "application/json", "cf-connecting-ip": clientIp }, body: JSON.stringify({ target_repository: "ContextualWisdomLab/noema" }) }), { ...baseEnv, GITHUB_APP_PRIVATE_KEY_PEM: appPrivateKeyPem });
}

describe("GitHub installation expiry defensive coverage", () => {
  it("rejects a non-string expires_at instead of coercing timestamp authority", async () => {
    const response = await exchangeWithTokenResponse({ token: "ghs_value", expires_at: 123 }, "203.0.113.249");
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ error_code: "ERR_GITHUB_API", message: "GitHub API returned invalid installation-token response" });
  });

  it("rejects an oversized installation token before granting credential authority", async () => {
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const response = await exchangeWithTokenResponse({ token: "g".repeat(4097), expires_at: expiresAt }, "203.0.113.252");
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ error_code: "ERR_GITHUB_API", message: "GitHub API returned invalid installation-token response" });
  });

  it("rejects a parseable but non-canonical offset expiry before granting credential authority", async () => {
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString().replace(/Z$/, "+00:00");
    const response = await exchangeWithTokenResponse({ token: "ghs_value", expires_at: expiresAt }, "203.0.113.251");
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ error_code: "ERR_GITHUB_API", message: "GitHub API returned invalid installation-token expiry" });
  });

  it("fails closed if canonical timestamp serialization itself is unavailable", async () => {
    vi.spyOn(Date.prototype, "toISOString").mockImplementation(() => { throw new RangeError("date serialization unavailable"); });
    const response = await exchangeWithTokenResponse({ token: "ghs_value", expires_at: "2030-01-01T00:30:00Z" }, "203.0.113.250");
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ error_code: "ERR_GITHUB_API", message: "GitHub API returned invalid installation-token expiry" });
  });
});
