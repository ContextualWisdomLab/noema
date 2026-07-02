import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../src/index";

const env: Env = {
  ALLOWED_ISSUER: "https://token.actions.githubusercontent.com",
  ALLOWED_AUDIENCE: "cwl-noema-review",
  ALLOWED_REPOSITORY_OWNER: "ContextualWisdomLab",
  ALLOWED_WORKFLOW_REPOSITORY: "ContextualWisdomLab/.github",
  ALLOWED_WORKFLOW_REF_PREFIX: "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main",
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

function testSafeHash(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

async function createSignedJwt(payload: Record<string, unknown>) {
  const keyPair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const kid = `oidc-test-key-${crypto.randomUUID()}`;
  const header = encodeSegment({ alg: "RS256", kid, typ: "JWT" });
  const body = encodeSegment(payload);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", keyPair.privateKey, new TextEncoder().encode(`${header}.${body}`));
  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  return {
    token: `${header}.${body}.${encodeBytes(signature)}`,
    jwk: { ...publicJwk, kid, kty: "RSA" },
  };
}

describe("Noema worker", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports health", async () => {
    const response = await worker.fetch(new Request("https://noema.example/health"), env);

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({
      ok: true,
      data: { name: "noema" },
    });
    expect(typeof payload.trace_id).toBe("string");
    expect(response.headers.get("x-trace-id")).toBeTruthy();
    expect(response.headers.get("x-latency-ms")).toBeTruthy();
  });

  it("returns JSON 404 for unknown routes", async () => {
    const response = await worker.fetch(new Request("https://noema.example/missing"), env);

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload).toMatchObject({
      ok: false,
      error_code: "ERR_VALIDATION_INPUT",
      details: {
        hint: expect.any(String),
      },
    });
    expect(typeof payload.trace_id).toBe("string");
  });

  it("does not reflect overlong request trace headers", async () => {
    const unsafeTraceId = "trace-".padEnd(200, "x");
    const response = await worker.fetch(new Request("https://noema.example/health", {
      headers: { "x-request-id": unsafeTraceId },
    }), env);

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.trace_id).not.toBe(unsafeTraceId);
    expect(response.headers.get("x-trace-id")).toBe(payload.trace_id);
    expect(String(payload.trace_id)).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("returns a standard internal error when an unexpected runtime exception occurs", async () => {
    vi.spyOn(console, "log")
      .mockImplementationOnce(() => {
        throw new Error("log sink unavailable");
      })
      .mockImplementation(() => undefined);

    const response = await worker.fetch(new Request("https://noema.example/health"), env);

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload).toMatchObject({
      ok: false,
      error_code: "ERR_INTERNAL",
      details: {
        hint: expect.any(String),
      },
    });
    expect(typeof payload.trace_id).toBe("string");
    expect(response.headers.get("x-trace-id")).toBeTruthy();
    expect(response.headers.get("x-latency-ms")).toBeTruthy();
  });

  it("rejects non-POST exchange requests", async () => {
    const response = await worker.fetch(new Request("https://noema.example/exchange"), env);

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    const payload = await response.json();
    expect(payload).toMatchObject({
      ok: false,
      error_code: "ERR_VALIDATION_INPUT",
      details: {
        hint: expect.any(String),
      },
    });
    expect(typeof payload.trace_id).toBe("string");
  });

  it("requires an exchange bearer token", async () => {
    const response = await worker.fetch(new Request("https://noema.example/exchange", { method: "POST" }), env);

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe('Bearer realm="noema", error="invalid_request"');
    const payload = await response.json();
    expect(payload).toMatchObject({
      ok: false,
      error_code: "ERR_AUTH_MISSING",
      details: {
        hint: expect.any(String),
      },
    });
    expect(typeof payload.trace_id).toBe("string");
    expect(response.headers.get("x-trace-id")).toBeTruthy();
    expect(response.headers.get("x-latency-ms")).toBeTruthy();
  });

  it("rate limits repeated exchange requests from the same client", async () => {
    const limitedEnv = {
      ...env,
      NOEMA_RATE_LIMIT_PER_MINUTE: "1",
    };
    const first = await worker.fetch(new Request("https://noema.example/exchange", {
      method: "POST",
      headers: { "cf-connecting-ip": "203.0.113.50" },
    }), limitedEnv);
    const second = await worker.fetch(new Request("https://noema.example/exchange", {
      method: "POST",
      headers: { "cf-connecting-ip": "203.0.113.50" },
    }), limitedEnv);

    expect(first.status).toBe(401);
    expect(second.status).toBe(429);
    expect(second.headers.get("retry-after")).toBeTruthy();
    const payload = await second.json();
    expect(payload).toMatchObject({
      ok: false,
      error_code: "ERR_RATE_LIMIT",
      details: {
        hint: expect.any(String),
        retry_after_seconds: expect.any(String),
        client_hash: expect.any(String),
      },
    });
  });

  it("bounds untrusted client identifiers before rate-limit hashing", async () => {
    const longClientIdentifier = "203.0.113.".padEnd(240, "9");
    const limitedEnv = {
      ...env,
      NOEMA_RATE_LIMIT_PER_MINUTE: "1",
    };
    const request = () => new Request("https://noema.example/exchange", {
      method: "POST",
      headers: { "cf-connecting-ip": longClientIdentifier },
    });

    const first = await worker.fetch(request(), limitedEnv);
    const second = await worker.fetch(request(), limitedEnv);

    expect(first.status).toBe(401);
    expect(second.status).toBe(429);
    const payload = await second.json();
    const boundedClientKey = `/exchange:hash:${testSafeHash(longClientIdentifier)}`;
    expect(payload).toMatchObject({
      ok: false,
      error_code: "ERR_RATE_LIMIT",
      details: {
        client_hash: testSafeHash(boundedClientKey),
      },
    });
  });

  it("rejects non-string target_repository values before creating a GitHub token", async () => {
    const now = Math.floor(Date.now() / 1000);
    const { token: oidcToken, jwk } = await createSignedJwt({
      iss: env.ALLOWED_ISSUER,
      aud: env.ALLOWED_AUDIENCE,
      repository_owner: env.ALLOWED_REPOSITORY_OWNER,
      repository: "ContextualWisdomLab/.github",
      job_workflow_ref: "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main",
      sub: "repo:ContextualWisdomLab/.github:ref:refs/heads/main",
      exp: now + 300,
      nbf: now - 30,
      iat: now - 30,
    });
    const requests: Array<{ url: string; method: string }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      requests.push({ url, method: init?.method || "GET" });
      if (url === "https://token.actions.githubusercontent.com/.well-known/openid-configuration") {
        return Response.json({ jwks_uri: "https://token.actions.githubusercontent.com/.well-known/jwks" });
      }
      if (url === "https://token.actions.githubusercontent.com/.well-known/jwks") {
        return Response.json({ keys: [jwk] });
      }
      return new Response("unexpected GitHub call", { status: 500 });
    });

    const response = await worker.fetch(new Request("https://noema.example/exchange", {
      method: "POST",
      headers: {
        authorization: `Bearer ${oidcToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ target_repository: { owner: "ContextualWisdomLab", repo: "noema" } }),
    }), env);

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload).toMatchObject({
      ok: false,
      error_code: "ERR_VALIDATION_INPUT",
      details: {
        hint: expect.any(String),
        field: "target_repository",
        reason: "must be a string",
        received_type: "object",
      },
    });
    expect(requests.filter((request) => request.url.includes("api.github.com"))).toHaveLength(0);
  });

  it("refreshes OIDC JWKS when the cached keys do not include the token kid", async () => {
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      iss: env.ALLOWED_ISSUER,
      aud: env.ALLOWED_AUDIENCE,
      repository_owner: env.ALLOWED_REPOSITORY_OWNER,
      repository: "ContextualWisdomLab/.github",
      job_workflow_ref: "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main",
      sub: "repo:ContextualWisdomLab/.github:ref:refs/heads/main",
      exp: now + 300,
      nbf: now - 30,
      iat: now - 30,
    };
    const first = await createSignedJwt(claims);
    const second = await createSignedJwt(claims);
    const jwksResponses = [first.jwk, second.jwk];
    const requests: Array<{ url: string; method: string }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      requests.push({ url, method: init?.method || "GET" });
      if (url === "https://token.actions.githubusercontent.com/.well-known/openid-configuration") {
        return Response.json({ jwks_uri: "https://token.actions.githubusercontent.com/.well-known/jwks" });
      }
      if (url === "https://token.actions.githubusercontent.com/.well-known/jwks") {
        return Response.json({ keys: [jwksResponses.shift()] });
      }
      return new Response("unexpected GitHub call", { status: 500 });
    });
    const exchangeRequest = (token: string) => new Request("https://noema.example/exchange", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ target_repository: { owner: "ContextualWisdomLab", repo: "noema" } }),
    });

    const firstResponse = await worker.fetch(exchangeRequest(first.token), env);
    const secondResponse = await worker.fetch(exchangeRequest(second.token), env);

    expect(firstResponse.status).toBe(400);
    expect(secondResponse.status).toBe(400);
    expect(requests.filter((request) => request.url === "https://token.actions.githubusercontent.com/.well-known/jwks")).toHaveLength(2);
    expect(requests.filter((request) => request.url.includes("api.github.com"))).toHaveLength(0);
  });

  it("reports malformed exchange tokens as JSON errors", async () => {
    const response = await worker.fetch(new Request("https://noema.example/exchange", {
      method: "POST",
      headers: { authorization: "Bearer malformed" },
    }), env);

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload).toMatchObject({
      ok: false,
      error_code: "ERR_TOKEN_MALFORMED",
      details: {
        hint: expect.any(String),
      },
    });
    expect(typeof payload.trace_id).toBe("string");
  });

  it("rejects JWTs with unacceptable signing headers before OIDC lookup", async () => {
    const token = [
      encodeSegment({ alg: "HS256", kid: "not-rsa" }),
      encodeSegment({}),
      "signature",
    ].join(".");
    const response = await worker.fetch(new Request("https://noema.example/exchange", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    }), env);

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe('Bearer realm="noema", error="invalid_token"');
    const payload = await response.json();
    expect(payload).toMatchObject({
      ok: false,
      error_code: "ERR_TOKEN_MALFORMED",
      details: {
        hint: expect.any(String),
      },
    });
  });

  it("exchanges a valid central-workflow OIDC token for a least-privilege installation token", async () => {
    const now = Math.floor(Date.now() / 1000);
    const { token: oidcToken, jwk } = await createSignedJwt({
      iss: env.ALLOWED_ISSUER,
      aud: env.ALLOWED_AUDIENCE,
      repository_owner: env.ALLOWED_REPOSITORY_OWNER,
      repository: "ContextualWisdomLab/.github",
      job_workflow_ref: "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main",
      sub: "repo:ContextualWisdomLab/.github:ref:refs/heads/main",
      exp: now + 300,
      nbf: now - 30,
      iat: now - 30,
    });
    const appKeyPair = await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"],
    );
    const appPrivateKey = pemFromPkcs8(await crypto.subtle.exportKey("pkcs8", appKeyPair.privateKey));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const requests: Array<{ url: string; method: string; body?: string }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      requests.push({ url, method: init?.method || "GET", body: typeof init?.body === "string" ? init.body : undefined });
      if (url === "https://token.actions.githubusercontent.com/.well-known/openid-configuration") {
        return Response.json({ jwks_uri: "https://token.actions.githubusercontent.com/.well-known/jwks" });
      }
      if (url === "https://token.actions.githubusercontent.com/.well-known/jwks") {
        return Response.json({ keys: [jwk] });
      }
      if (url === "https://api.github.com/repos/ContextualWisdomLab/noema/installation") {
        return Response.json({ id: 12345 });
      }
      if (url === "https://api.github.com/app/installations/12345/access_tokens") {
        return Response.json({
          token: "ghs_installation_token",
          expires_at: "2026-07-02T05:00:00Z",
        });
      }
      return new Response("not found", { status: 404 });
    });

    const exchangeRequest = () => new Request("https://noema.example/exchange", {
      method: "POST",
      headers: {
        authorization: `Bearer ${oidcToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ target_repository: "ContextualWisdomLab/noema" }),
    });
    const runtimeEnv = {
      ...env,
      GITHUB_APP_PRIVATE_KEY_PEM: appPrivateKey,
    };
    const response = await worker.fetch(exchangeRequest(), runtimeEnv);
    const cachedResponse = await worker.fetch(exchangeRequest(), runtimeEnv);

    expect(response.status).toBe(200);
    expect(cachedResponse.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    const payload = await response.json();
    expect(payload).toMatchObject({
      ok: true,
      data: {
        token: "ghs_installation_token",
        repository: "ContextualWisdomLab/noema",
        workflow_ref: "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main",
        token_expires_at: "2026-07-02T05:00:00Z",
      },
    });
    const tokenRequest = requests.find((request) => request.url.endsWith("/app/installations/12345/access_tokens"));
    expect(tokenRequest?.method).toBe("POST");
    expect(JSON.parse(tokenRequest?.body || "{}")).toEqual({
      repositories: ["noema"],
      permissions: {
        pull_requests: "write",
        contents: "read",
        checks: "read",
      },
    });
    expect(requests.filter((request) => request.url === "https://token.actions.githubusercontent.com/.well-known/openid-configuration")).toHaveLength(1);
    expect(requests.filter((request) => request.url === "https://token.actions.githubusercontent.com/.well-known/jwks")).toHaveLength(1);
    expect(requests.filter((request) => request.url === "https://api.github.com/repos/ContextualWisdomLab/noema/installation")).toHaveLength(1);
    expect(requests.filter((request) => request.url === "https://api.github.com/app/installations/12345/access_tokens")).toHaveLength(2);
    const logOutput = logSpy.mock.calls.flat().join("\n");
    expect(logOutput).not.toContain("ghs_installation_token");
    expect(logOutput).not.toContain(oidcToken);
    expect(logOutput).toContain("token_expires_at");
  });

  it("reports invalid GitHub installation token expiry with field-level details", async () => {
    const now = Math.floor(Date.now() / 1000);
    const { token: oidcToken, jwk } = await createSignedJwt({
      iss: env.ALLOWED_ISSUER,
      aud: env.ALLOWED_AUDIENCE,
      repository_owner: env.ALLOWED_REPOSITORY_OWNER,
      repository: "ContextualWisdomLab/.github",
      job_workflow_ref: "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main",
      sub: "repo:ContextualWisdomLab/.github:ref:refs/heads/main",
      exp: now + 300,
      nbf: now - 30,
      iat: now - 30,
    });
    const appKeyPair = await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"],
    );
    const appPrivateKey = pemFromPkcs8(await crypto.subtle.exportKey("pkcs8", appKeyPair.privateKey));
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "https://token.actions.githubusercontent.com/.well-known/openid-configuration") {
        return Response.json({ jwks_uri: "https://token.actions.githubusercontent.com/.well-known/jwks" });
      }
      if (url === "https://token.actions.githubusercontent.com/.well-known/jwks") {
        return Response.json({ keys: [jwk] });
      }
      if (url === "https://api.github.com/repos/ContextualWisdomLab/noema/installation") {
        return Response.json({ id: 12345 });
      }
      if (url === "https://api.github.com/app/installations/12345/access_tokens") {
        return Response.json({
          token: "ghs_installation_token",
          expires_at: "not-a-date",
        });
      }
      return new Response("not found", { status: 404 });
    });

    const response = await worker.fetch(new Request("https://noema.example/exchange", {
      method: "POST",
      headers: {
        authorization: `Bearer ${oidcToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ target_repository: "ContextualWisdomLab/noema" }),
    }), {
      ...env,
      GITHUB_APP_PRIVATE_KEY_PEM: appPrivateKey,
    });

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload).toMatchObject({
      ok: false,
      error_code: "ERR_GITHUB_INSTALLATION",
      details: {
        hint: expect.any(String),
        field: "expires_at",
        reason: "must be a valid timestamp",
      },
    });
  });
});
