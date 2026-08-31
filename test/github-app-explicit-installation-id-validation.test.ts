import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../src/index";

const configuredRef =
  "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main";
const configuredWorkflowSha = "a".repeat(40);
const expectedRepositoryOwnerId = "295022177";
const expectedWorkflowRepositoryId = "1274066402";

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

async function signedOidcToken() {
  const kid = `explicit-installation-${crypto.randomUUID()}`;
  const now = Math.floor(Date.now() / 1000);
  const header = encodeSegment({ alg: "RS256", kid, typ: "JWT" });
  const payload = encodeSegment({
    iss: baseEnv.ALLOWED_ISSUER,
    aud: baseEnv.ALLOWED_AUDIENCE,
    repository_owner: baseEnv.ALLOWED_REPOSITORY_OWNER,
    repository_owner_id: expectedRepositoryOwnerId,
    repository: "ContextualWisdomLab/.github",
    repository_id: expectedWorkflowRepositoryId,
    job_workflow_ref: configuredRef,
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
  return {
    token: `${header}.${payload}.${encodeBytes(signature)}`,
    jwk: { ...oidcPublicJwk, kid, kty: "RSA" },
  };
}

async function exchangeWithConfiguredInstallationId(installationId: string, clientIp: string) {
  const { token, jwk } = await signedOidcToken();
  let githubApiCalls = 0;
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
    githubApiCalls += 1;
    return new Response("configured installation id must fail before GitHub App egress", { status: 500 });
  });

  const response = await worker.fetch(
    new Request("https://noema.example/exchange", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "cf-connecting-ip": clientIp,
      },
      body: JSON.stringify({ target_repository: "ContextualWisdomLab/noema" }),
    }),
    {
      ...baseEnv,
      GITHUB_APP_PRIVATE_KEY_PEM: appPrivateKeyPem,
      GITHUB_APP_INSTALLATION_ID: installationId,
    },
  );

  return { response, githubApiCalls };
}

async function exchangeWithRepositoryBoundInstallationId(
  configuredInstallationId: string,
  discoveredInstallationId: number,
  clientIp: string,
) {
  const { token, jwk } = await signedOidcToken();
  const githubApiCalls: string[] = [];
  const repositoryInstallationUrl =
    "https://api.github.com/repos/ContextualWisdomLab/noema/installation";
  const installationTokenUrl =
    `https://api.github.com/app/installations/${configuredInstallationId}/access_tokens`;

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

    githubApiCalls.push(url);
    if (url === repositoryInstallationUrl) {
      return Response.json({ id: discoveredInstallationId }, { status: 200 });
    }
    if (url === installationTokenUrl) {
      return Response.json({
        token: "ghs_repository_scoped",
        expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
      }, { status: 201 });
    }
    return new Response("unexpected GitHub API request", { status: 500 });
  });

  const response = await worker.fetch(
    new Request("https://noema.example/exchange", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "cf-connecting-ip": clientIp,
      },
      body: JSON.stringify({ target_repository: "ContextualWisdomLab/noema" }),
    }),
    {
      ...baseEnv,
      GITHUB_APP_PRIVATE_KEY_PEM: appPrivateKeyPem,
      GITHUB_APP_INSTALLATION_ID: configuredInstallationId,
    },
  );

  return {
    response,
    githubApiCalls,
    repositoryInstallationUrl,
    installationTokenUrl,
  };
}

describe("configured GitHub App installation id", () => {
  it.each([
    ["0", "203.0.113.250"],
    ["-1", "203.0.113.251"],
    ["1.5", "203.0.113.252"],
    ["12345/../../repos", "203.0.113.253"],
    ["01", "203.0.113.254"],
    ["9007199254740992", "203.0.113.255"],
  ])("fails closed before GitHub App egress for invalid id %s", async (installationId, clientIp) => {
    const { response, githubApiCalls } = await exchangeWithConfiguredInstallationId(installationId, clientIp);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_GITHUB_INSTALLATION",
      message: "GitHub App installation id configuration is invalid",
    });
    expect(githubApiCalls).toBe(0);
  });

  it("rejects a syntactically valid configured id that belongs to a different installation", async () => {
    const {
      response,
      githubApiCalls,
      repositoryInstallationUrl,
    } = await exchangeWithRepositoryBoundInstallationId(
      "12345",
      67890,
      "203.0.113.248",
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_GITHUB_INSTALLATION",
      message: "GitHub App installation id does not match target repository",
    });
    expect(githubApiCalls).toEqual([repositoryInstallationUrl]);
  });

  it("mints only after a configured id is verified against the target repository", async () => {
    const {
      response,
      githubApiCalls,
      repositoryInstallationUrl,
      installationTokenUrl,
    } = await exchangeWithRepositoryBoundInstallationId(
      "12346",
      12346,
      "203.0.113.247",
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        token: "ghs_repository_scoped",
        repository: "ContextualWisdomLab/noema",
      },
    });
    expect(githubApiCalls).toEqual([
      repositoryInstallationUrl,
      installationTokenUrl,
    ]);
  });
});
