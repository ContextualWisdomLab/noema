import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../src/index";

const configuredRef =
  "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main";
const configuredWorkflowSha = "a".repeat(40);
const expectedRepositoryOwnerId = "295022177";
const expectedNoemaRepositoryId = "1285107801";
const expectedWorkflowRepositoryId = "1274066402";
const canonicalSubject = "repo:ContextualWisdomLab/.github:ref:refs/heads/main";

const env: Env = {
  ALLOWED_ISSUER: "https://token.actions.githubusercontent.com",
  ALLOWED_AUDIENCE: "cwl-noema-review",
  ALLOWED_REPOSITORY_OWNER: "ContextualWisdomLab",
  ALLOWED_WORKFLOW_REPOSITORY: "ContextualWisdomLab/.github",
  ALLOWED_WORKFLOW_REF_PREFIX: configuredRef,
  ALLOWED_WORKFLOW_SHA: configuredWorkflowSha,
  GITHUB_API_BASE: "https://api.github.com",
  GITHUB_APP_ID: "1",
  GITHUB_APP_PRIVATE_KEY_PEM: "unused-before-authorization",
  NOEMA_RATE_LIMIT_PER_MINUTE: "1000",
};

function encodeSegment(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

async function createToken(repository: string | undefined) {
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
  const kid = `target-auth-${crypto.randomUUID()}`;
  const now = Math.floor(Date.now() / 1000);
  const repositoryId =
    repository === "ContextualWisdomLab/.github"
      ? expectedWorkflowRepositoryId
      : repository === "ContextualWisdomLab/noema"
        ? expectedNoemaRepositoryId
        : undefined;
  const header = encodeSegment({ alg: "RS256", kid, typ: "JWT" });
  const body = encodeSegment({
    iss: env.ALLOWED_ISSUER,
    aud: env.ALLOWED_AUDIENCE,
    repository_owner: env.ALLOWED_REPOSITORY_OWNER,
    repository_owner_id: expectedRepositoryOwnerId,
    repository,
    ...(repositoryId ? { repository_id: repositoryId } : {}),
    job_workflow_ref: configuredRef,
    job_workflow_sha: configuredWorkflowSha,
    sub: canonicalSubject,
    exp: now + 300,
    nbf: now - 30,
    iat: now - 30,
  });
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    keyPair.privateKey,
    new TextEncoder().encode(`${header}.${body}`),
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  return {
    token: `${header}.${body}.${Buffer.from(signature).toString("base64url")}`,
    jwk: { ...publicJwk, kid, kty: "RSA" },
  };
}

function mockOidc(jwk: JsonWebKey) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith("/.well-known/openid-configuration")) {
      return Response.json({
        jwks_uri: "https://token.actions.githubusercontent.com/.well-known/jwks",
      });
    }
    if (url.endsWith("/.well-known/jwks")) return Response.json({ keys: [jwk] });
    return new Response("unexpected privileged egress", { status: 500 });
  });
}

function exchange(token: string, body: string, ip: string) {
  return worker.fetch(
    new Request("https://noema.example/exchange", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "cf-connecting-ip": ip,
      },
      body,
    }),
    env,
  );
}

afterEach(() => vi.restoreAllMocks());

describe("target authorization through the public exchange path", () => {
  it("rejects cross-repository minting when the claim is neither target nor trusted workflow repository", async () => {
    const { token, jwk } = await createToken("ContextualWisdomLab/source-repository");
    mockOidc(jwk);

    const response = await exchange(
      token,
      JSON.stringify({ target_repository: "ContextualWisdomLab/noema" }),
      "203.0.113.216",
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_REPO_NOT_ALLOWED",
      message: "OIDC repository cannot request token for target_repository",
    });
  });

  it("fails repository syntax validation when neither request nor verified claim supplies a target repository", async () => {
    const { token, jwk } = await createToken(undefined);
    mockOidc(jwk);

    const response = await exchange(token, "{}", "203.0.113.217");

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_VALIDATION_INPUT",
      message: "target_repository is not a valid owner/name repository",
    });
  });

  it.each([
    ["leading ASCII space", " ContextualWisdomLab/noema"],
    ["trailing ASCII space", "ContextualWisdomLab/noema "],
    ["leading tab", "\tContextualWisdomLab/noema"],
  ])("rejects non-canonical target_repository authority with %s", async (_label, targetRepository) => {
    const { token, jwk } = await createToken("ContextualWisdomLab/.github");
    mockOidc(jwk);

    const response = await exchange(
      token,
      JSON.stringify({ target_repository: targetRepository }),
      `203.0.113.${220 + targetRepository.length % 10}`,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_VALIDATION_INPUT",
      message: "target_repository is not a valid owner/name repository",
    });
  });
});
