import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../src/index";

const configuredRef =
  "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main";
const configuredWorkflowSha = "a".repeat(40);
const expectedRepositoryOwnerId = "295022177";
const expectedWorkflowRepositoryId = "1274066402";

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
  const kid = `github-json-${crypto.randomUUID()}`;
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

async function exchangeWith(
  targetRepository: string,
  env: Env,
  githubHandler: (url: string) => Promise<Response> | Response,
  clientIp: string,
): Promise<Response> {
  const { token, jwk } = await signedOidcToken();
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
    return githubHandler(url);
  });

  return worker.fetch(
    new Request("https://noema.example/exchange", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "cf-connecting-ip": clientIp,
      },
      body: JSON.stringify({ target_repository: targetRepository }),
    }),
    { ...env, GITHUB_APP_PRIVATE_KEY_PEM: appPrivateKeyPem },
  );
}

describe("GitHub API success-response parsing", () => {
  it("classifies malformed installation JSON as an upstream GitHub API failure", async () => {
    const targetRepository = "ContextualWisdomLab/malformed-installation-json";
    const response = await exchangeWith(targetRepository, baseEnv, (url) => {
      if (url === `https://api.github.com/repos/${targetRepository}/installation`) {
        return new Response("{", {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("unexpected GitHub request", { status: 500 });
    }, "203.0.113.240");

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_GITHUB_API",
      message: "GitHub API returned malformed JSON",
    });
  });

  it("classifies malformed installation-token JSON as an upstream GitHub API failure", async () => {
    const response = await exchangeWith(
      "ContextualWisdomLab/malformed-token-json",
      { ...baseEnv, GITHUB_APP_INSTALLATION_ID: "92345" },
      (url) => {
        if (url === "https://api.github.com/app/installations/92345/access_tokens") {
          return new Response("{", {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response("unexpected GitHub request", { status: 500 });
      },
      "203.0.113.241",
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_GITHUB_API",
      message: "GitHub API returned malformed JSON",
    });
  });

  it("classifies a bodyless successful installation-token response as malformed JSON", async () => {
    const response = await exchangeWith(
      "ContextualWisdomLab/bodyless-token-json",
      { ...baseEnv, GITHUB_APP_INSTALLATION_ID: "92345" },
      (url) => {
        if (url === "https://api.github.com/app/installations/92345/access_tokens") {
          return new Response(null, {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response("unexpected GitHub request", { status: 500 });
      },
      "203.0.113.237",
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_GITHUB_API",
      message: "GitHub API returned malformed JSON",
    });
  });

  it("cancels an oversized streamed installation-token authority body before full materialization", async () => {
    let pulls = 0;
    let cancelled = false;
    const chunk = new Uint8Array(32_768).fill(0x20);
    const streamedBody = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls <= 8) {
          controller.enqueue(chunk);
          return;
        }
        controller.close();
      },
      cancel() {
        cancelled = true;
      },
    });

    const response = await exchangeWith(
      "ContextualWisdomLab/oversized-streamed-token-json",
      { ...baseEnv, GITHUB_APP_INSTALLATION_ID: "92345" },
      (url) => {
        if (url === "https://api.github.com/app/installations/92345/access_tokens") {
          return new Response(streamedBody, {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response("unexpected GitHub request", { status: 500 });
      },
      "203.0.113.239",
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_GITHUB_API",
      message: "GitHub API returned malformed JSON",
    });
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThan(8);
  });

  it.each([
    ["null", "203.0.113.242"],
    ["[]", "203.0.113.243"],
    ["\"unexpected\"", "203.0.113.244"],
  ])("classifies non-object installation JSON %s as an upstream GitHub API failure", async (body, clientIp) => {
    const targetRepository = `ContextualWisdomLab/invalid-installation-${clientIp.split(".").at(-1)}`;
    const response = await exchangeWith(targetRepository, baseEnv, (url) => {
      if (url === `https://api.github.com/repos/${targetRepository}/installation`) {
        return new Response(body, {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("unexpected GitHub request", { status: 500 });
    }, clientIp);

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_GITHUB_API",
      message: "GitHub API returned invalid JSON shape",
    });
  });

  it("rejects a non-numeric installation id before token minting", async () => {
    const targetRepository = "ContextualWisdomLab/invalid-installation-id";
    const response = await exchangeWith(targetRepository, baseEnv, (url) => {
      if (url === `https://api.github.com/repos/${targetRepository}/installation`) {
        return Response.json({ id: { attacker_controlled: true } });
      }
      return new Response("unexpected GitHub request", { status: 500 });
    }, "203.0.113.245");

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_GITHUB_API",
      message: "GitHub API returned invalid installation response",
    });
  });

  it("rejects non-string installation token material instead of coercing it into a credential", async () => {
    const response = await exchangeWith(
      "ContextualWisdomLab/invalid-token-shape",
      { ...baseEnv, GITHUB_APP_INSTALLATION_ID: "92345" },
      (url) => {
        if (url === "https://api.github.com/app/installations/92345/access_tokens") {
          return Response.json({
            token: { attacker_controlled: true },
            expires_at: "2099-01-01T00:00:00Z",
          });
        }
        return new Response("unexpected GitHub request", { status: 500 });
      },
      "203.0.113.246",
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_GITHUB_API",
      message: "GitHub API returned invalid installation-token response",
    });
  });

  it.each([
    ["ghs_line\nfeed", "203.0.113.249"],
    ["ghs_carriage\rreturn", "203.0.113.250"],
    ["ghs leading", "203.0.113.251"],
    ["ghs_trailing ", "203.0.113.252"],
    ["ghs_non\u00a0breaking", "203.0.113.253"],
  ])("rejects installation token material containing non-canonical credential bytes", async (token, clientIp) => {
    const response = await exchangeWith(
      "ContextualWisdomLab/control-byte-installation-token",
      { ...baseEnv, GITHUB_APP_INSTALLATION_ID: "92345" },
      (url) => {
        if (url === "https://api.github.com/app/installations/92345/access_tokens") {
          return Response.json({
            token,
            expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
          });
        }
        return new Response("unexpected GitHub request", { status: 500 });
      },
      clientIp,
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_GITHUB_API",
      message: "GitHub API returned invalid installation-token response",
    });
  });

  it("rejects an already-expired installation token instead of returning unusable credential material", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2030-01-01T00:00:00Z"));
    const response = await exchangeWith(
      "ContextualWisdomLab/expired-installation-token",
      { ...baseEnv, GITHUB_APP_INSTALLATION_ID: "92345" },
      (url) => {
        if (url === "https://api.github.com/app/installations/92345/access_tokens") {
          return Response.json({
            token: "ghs_expired",
            expires_at: "2029-12-31T23:59:59Z",
          });
        }
        return new Response("unexpected GitHub request", { status: 500 });
      },
      "203.0.113.247",
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_GITHUB_API",
      message: "GitHub API returned expired installation-token response",
    });
  });

  it("rejects an installation token whose declared lifetime exceeds GitHub's one-hour contract", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2030-01-01T00:00:00Z"));
    const response = await exchangeWith(
      "ContextualWisdomLab/overlong-installation-token",
      { ...baseEnv, GITHUB_APP_INSTALLATION_ID: "92345" },
      (url) => {
        if (url === "https://api.github.com/app/installations/92345/access_tokens") {
          return Response.json({
            token: "ghs_overlong",
            expires_at: "2030-01-01T02:00:00Z",
          });
        }
        return new Response("unexpected GitHub request", { status: 500 });
      },
      "203.0.113.248",
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_GITHUB_API",
      message: "GitHub API returned implausible installation-token expiry",
    });
  });
});
