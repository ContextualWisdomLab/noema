import { beforeAll, afterEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../src/index";

const configuredRef =
  "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main";
const configuredWorkflowSha = "a".repeat(40);
const expectedRepositoryOwnerId = "295022177";
const expectedNoemaRepositoryId = "1285107801";
const expectedWorkflowRepositoryId = "1274066402";

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
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
}

beforeAll(async () => {
  oidcKeyPair = await generateRsaKeyPair();
  oidcPublicJwk = await crypto.subtle.exportKey("jwk", oidcKeyPair.publicKey);
  const appKeyPair = await generateRsaKeyPair();
  appPrivateKeyPem = pemFromPkcs8(await crypto.subtle.exportKey("pkcs8", appKeyPair.privateKey));
});

afterEach(() => vi.restoreAllMocks());

async function signedOidcToken(
  repositoryOwnerId: string | undefined,
  repository = "ContextualWisdomLab/noema",
  ...repositoryIdArgs: [] | [string | undefined]
) {
  const repositoryId = repositoryIdArgs.length === 0
    ? expectedNoemaRepositoryId
    : repositoryIdArgs[0];
  const kid = `github-owner-id-${crypto.randomUUID()}`;
  const now = Math.floor(Date.now() / 1000);
  const header = encodeSegment({ alg: "RS256", kid, typ: "JWT" });
  const payload = encodeSegment({
    iss: "https://token.actions.githubusercontent.com",
    aud: "cwl-noema-review",
    repository_owner: "ContextualWisdomLab",
    repository_owner_id: repositoryOwnerId,
    repository,
    repository_id: repositoryId,
    job_workflow_ref: configuredRef,
    job_workflow_sha: configuredWorkflowSha,
    exp: now + 300,
    nbf: now - 30,
    iat: now - 30,
  });
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    oidcKeyPair.privateKey,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  return { token: `${header}.${payload}.${encodeBytes(signature)}`, jwk: { ...oidcPublicJwk, kid, kty: "RSA" } };
}

function runtimeEnv(): Env {
  return {
    ALLOWED_ISSUER: "https://token.actions.githubusercontent.com",
    ALLOWED_AUDIENCE: "cwl-noema-review",
    ALLOWED_REPOSITORY_OWNER: "ContextualWisdomLab",
    ALLOWED_WORKFLOW_REPOSITORY: "ContextualWisdomLab/.github",
    ALLOWED_WORKFLOW_REF_PREFIX: configuredRef,
    ALLOWED_WORKFLOW_SHA: configuredWorkflowSha,
    GITHUB_API_BASE: "https://api.github.com",
    GITHUB_APP_ID: "1",
    GITHUB_APP_PRIVATE_KEY_PEM: appPrivateKeyPem,
    GITHUB_APP_INSTALLATION_ID: "92345",
    NOEMA_RATE_LIMIT_PER_MINUTE: "1000",
  };
}

async function exerciseToken(token: string, jwk: JsonWebKey, clientIp: string) {
  let githubAppEgressCount = 0;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url === "https://token.actions.githubusercontent.com/.well-known/openid-configuration") {
      return Response.json({ jwks_uri: "https://token.actions.githubusercontent.com/.well-known/jwks" });
    }
    if (url === "https://token.actions.githubusercontent.com/.well-known/jwks") return Response.json({ keys: [jwk] });
    githubAppEgressCount += 1;
    return new Response("expected downstream boundary", { status: 500 });
  });
  const response = await worker.fetch(
    new Request("https://noema.example/exchange", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "cf-connecting-ip": clientIp },
      body: JSON.stringify({ target_repository: "ContextualWisdomLab/noema" }),
    }),
    runtimeEnv(),
  );
  return { response, githubAppEgressCount };
}

async function expectRepositoryIdentityRejection(
  repository: string,
  repositoryId: string | undefined,
  clientIp: string,
) {
  const { token, jwk } = await signedOidcToken(expectedRepositoryOwnerId, repository, repositoryId);
  const { response, githubAppEgressCount } = await exerciseToken(token, jwk, clientIp);
  expect(response.status).toBe(403);
  await expect(response.json()).resolves.toMatchObject({
    ok: false,
    error_code: "ERR_REPO_NOT_ALLOWED",
    message: "OIDC repository identity is not allowed",
  });
  expect(githubAppEgressCount).toBe(0);
}

describe("OIDC immutable repository identity", () => {
  it("rejects a signed same-name owner carrying a different GitHub owner id before GitHub App egress", async () => {
    const { token, jwk } = await signedOidcToken("1");
    const { response, githubAppEgressCount } = await exerciseToken(token, jwk, "203.0.113.250");
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_REPO_NOT_ALLOWED",
      message: "OIDC repository owner identity is not allowed",
    });
    expect(githubAppEgressCount).toBe(0);
  });

  it("rejects a signed same-name owner when the immutable GitHub owner id claim is missing", async () => {
    const { token, jwk } = await signedOidcToken(undefined);
    const { response, githubAppEgressCount } = await exerciseToken(token, jwk, "203.0.113.249");
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_REPO_NOT_ALLOWED",
      message: "OIDC repository owner identity is not allowed",
    });
    expect(githubAppEgressCount).toBe(0);
  });

  it("rejects a same-name Noema repository carrying a different immutable repository id", async () => {
    await expectRepositoryIdentityRejection("ContextualWisdomLab/noema", "1", "203.0.113.252");
  });

  it("rejects a known Noema repository when the immutable repository id claim is missing", async () => {
    await expectRepositoryIdentityRejection("ContextualWisdomLab/noema", undefined, "203.0.113.248");
  });

  it("rejects a same-name central workflow repository carrying a different immutable repository id", async () => {
    await expectRepositoryIdentityRejection("ContextualWisdomLab/.github", "1", "203.0.113.254");
  });

  it("allows the current Noema organization and repository ids through the immutable-identity boundary", async () => {
    const { token, jwk } = await signedOidcToken(expectedRepositoryOwnerId);
    const { response, githubAppEgressCount } = await exerciseToken(token, jwk, "203.0.113.251");
    expect(response.status).not.toBe(403);
    expect(githubAppEgressCount).toBe(1);
  });

  it("allows the current central workflow repository id instead of comparing it to Noema's repository id", async () => {
    const { token, jwk } = await signedOidcToken(
      expectedRepositoryOwnerId,
      "ContextualWisdomLab/.github",
      expectedWorkflowRepositoryId,
    );
    const { response, githubAppEgressCount } = await exerciseToken(token, jwk, "203.0.113.253");
    expect(response.status).not.toBe(403);
    expect(githubAppEgressCount).toBe(1);
  });
});
