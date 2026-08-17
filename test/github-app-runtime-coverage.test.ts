import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../src/index";

const configuredRef =
  "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main";

const baseEnv: Env = {
  ALLOWED_ISSUER: "https://token.actions.githubusercontent.com",
  ALLOWED_AUDIENCE: "cwl-noema-review",
  ALLOWED_REPOSITORY_OWNER: "ContextualWisdomLab",
  ALLOWED_WORKFLOW_REPOSITORY: "ContextualWisdomLab/.github",
  ALLOWED_WORKFLOW_REF_PREFIX: configuredRef,
  GITHUB_API_BASE: "https://api.github.com",
  GITHUB_APP_ID: "1",
  GITHUB_APP_PRIVATE_KEY_PEM: "initialized-in-beforeAll",
  NOEMA_RATE_LIMIT_PER_MINUTE: "1000",
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
  vi.useRealTimers();
});

async function createOidcToken() {
  const kid = `github-app-runtime-${crypto.randomUUID()}`;
  const now = Math.floor(Date.now() / 1000);
  const header = encodeSegment({ alg: "RS256", kid, typ: "JWT" });
  const payload = encodeSegment({
    iss: baseEnv.ALLOWED_ISSUER,
    aud: baseEnv.ALLOWED_AUDIENCE,
    repository_owner: baseEnv.ALLOWED_REPOSITORY_OWNER,
    repository: "ContextualWisdomLab/.github",
    job_workflow_ref: configuredRef,
    sub: "repo:ContextualWisdomLab/.github:ref:refs/heads/main",
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

async function exchange(
  targetRepository: string,
  env: Env,
  githubHandler: (url: string, init?: RequestInit) => Promise<Response> | Response,
  ip: string,
): Promise<Response> {
  const { token, jwk } = await createOidcToken();
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (url === "https://token.actions.githubusercontent.com/.well-known/openid-configuration") {
      return Response.json({
        jwks_uri: "https://token.actions.githubusercontent.com/.well-known/jwks",
      });
    }
    if (url === "https://token.actions.githubusercontent.com/.well-known/jwks") {
      return Response.json({ keys: [jwk] });
    }
    return githubHandler(url, init);
  });

  return worker.fetch(
    new Request("https://noema.example/exchange", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "cf-connecting-ip": ip,
      },
      body: JSON.stringify({ target_repository: targetRepository }),
    }),
    { ...env, GITHUB_APP_PRIVATE_KEY_PEM: appPrivateKeyPem },
  );
}

function successfulTokenResponse(token = "ghs_runtime_coverage") {
  return Response.json({
    token,
    expires_at: "2030-01-01T00:00:00Z",
  });
}

describe("GitHub App runtime coverage through the public exchange boundary", () => {
  it("uses an explicit installation id and requests one repository with least privilege", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const response = await exchange(
      "ContextualWisdomLab/noema",
      { ...baseEnv, GITHUB_APP_INSTALLATION_ID: "12345" },
      (url, init) => {
        calls.push({ url, init });
        if (url === "https://api.github.com/app/installations/12345/access_tokens") {
          return successfulTokenResponse();
        }
        return new Response("unexpected GitHub request", { status: 500 });
      },
      "203.0.113.220",
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        repository: "ContextualWisdomLab/noema",
        token: "ghs_runtime_coverage",
        token_expires_at: "2030-01-01T00:00:00Z",
      },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.github.com/app/installations/12345/access_tokens");
    expect(calls[0].init?.method).toBe("POST");
    expect(String(calls[0].init?.body)).toBe(JSON.stringify({
      repositories: ["noema"],
      permissions: {
        pull_requests: "write",
        contents: "read",
        checks: "read",
      },
    }));
  });

  it.each([
    [302, 500, "ERR_GITHUB_API"],
    [429, 429, "ERR_RATE_LIMIT"],
    [500, 502, "ERR_GITHUB_API"],
    [404, 400, "ERR_GITHUB_API"],
  ])("classifies installation lookup HTTP %i without attempting token mint", async (githubStatus, expectedStatus, errorCode) => {
    let tokenCalls = 0;
    const targetRepository = `ContextualWisdomLab/http-${githubStatus}`;
    const response = await exchange(
      targetRepository,
      baseEnv,
      (url) => {
        if (url === `https://api.github.com/repos/${targetRepository}/installation`) {
          return new Response("lookup failure", { status: githubStatus });
        }
        if (url.includes("/access_tokens")) tokenCalls += 1;
        return new Response("unexpected GitHub request", { status: 500 });
      },
      `203.0.113.${githubStatus === 429 ? 221 : githubStatus === 500 ? 222 : 223}`,
    );

    expect(response.status).toBe(expectedStatus);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: errorCode,
    });
    expect(tokenCalls).toBe(0);
  });

  it("fails closed when the installation lookup omits the installation id", async () => {
    const targetRepository = "ContextualWisdomLab/missing-installation-id";
    const response = await exchange(
      targetRepository,
      baseEnv,
      (url) => {
        if (url === `https://api.github.com/repos/${targetRepository}/installation`) {
          return Response.json({ account: { login: "ContextualWisdomLab" } });
        }
        return new Response("unexpected GitHub request", { status: 500 });
      },
      "203.0.113.224",
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_GITHUB_INSTALLATION",
      message: "GitHub App installation id was not found",
    });
  });

  it("fails closed when GitHub returns an empty installation token", async () => {
    const response = await exchange(
      "ContextualWisdomLab/no-token",
      { ...baseEnv, GITHUB_APP_INSTALLATION_ID: "22345" },
      (url) => {
        if (url === "https://api.github.com/app/installations/22345/access_tokens") {
          return Response.json({ expires_at: "2030-01-01T00:00:00Z" });
        }
        return new Response("unexpected GitHub request", { status: 500 });
      },
      "203.0.113.225",
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_GITHUB_INSTALLATION",
      message: "GitHub installation token response was empty",
      details: { field: "token", reason: "required" },
    });
  });

  it.each([undefined, "not-a-timestamp"])(
    "fails closed when GitHub returns invalid token expiry %s",
    async (expiresAt) => {
      const response = await exchange(
        `ContextualWisdomLab/bad-expiry-${expiresAt === undefined ? "missing" : "invalid"}`,
        { ...baseEnv, GITHUB_APP_INSTALLATION_ID: "32345" },
        (url) => {
          if (url === "https://api.github.com/app/installations/32345/access_tokens") {
            return Response.json({ token: "ghs_bad_expiry", expires_at: expiresAt });
          }
          return new Response("unexpected GitHub request", { status: 500 });
        },
        expiresAt === undefined ? "203.0.113.226" : "203.0.113.227",
      );

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toMatchObject({
        ok: false,
        error_code: "ERR_GITHUB_INSTALLATION",
        message: "GitHub installation token response did not include a valid expires_at",
        details: { field: "expires_at", reason: "must be a valid timestamp" },
      });
    },
  );

  it("reuses a fresh discovered installation id without repeating the repository lookup", async () => {
    const targetRepository = "ContextualWisdomLab/cached-installation";
    let installationLookups = 0;
    let tokenCalls = 0;
    const githubHandler = (url: string) => {
      if (url === `https://api.github.com/repos/${targetRepository}/installation`) {
        installationLookups += 1;
        return Response.json({ id: 42345 });
      }
      if (url === "https://api.github.com/app/installations/42345/access_tokens") {
        tokenCalls += 1;
        return successfulTokenResponse(`ghs_cached_${tokenCalls}`);
      }
      return new Response("unexpected GitHub request", { status: 500 });
    };

    const first = await exchange(targetRepository, baseEnv, githubHandler, "203.0.113.228");
    vi.restoreAllMocks();
    const second = await exchange(targetRepository, baseEnv, githubHandler, "203.0.113.229");

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(installationLookups).toBe(1);
    expect(tokenCalls).toBe(2);
  });

  it("drops an expired discovered installation id and performs a fresh lookup", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-17T12:00:00Z"));
    const targetRepository = "ContextualWisdomLab/expired-installation";
    let installationLookups = 0;
    const githubHandler = (url: string) => {
      if (url === `https://api.github.com/repos/${targetRepository}/installation`) {
        installationLookups += 1;
        return Response.json({ id: 52345 });
      }
      if (url === "https://api.github.com/app/installations/52345/access_tokens") {
        return successfulTokenResponse();
      }
      return new Response("unexpected GitHub request", { status: 500 });
    };
    const env = { ...baseEnv, NOEMA_INSTALLATION_CACHE_TTL_SECONDS: "1" };

    const first = await exchange(targetRepository, env, githubHandler, "203.0.113.230");
    vi.restoreAllMocks();
    vi.setSystemTime(new Date("2026-08-17T12:00:02Z"));
    const second = await exchange(targetRepository, env, githubHandler, "203.0.113.231");

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(installationLookups).toBe(2);
  });
});