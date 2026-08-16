import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../src/index";

const baseEnv: Env = {
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

async function createSignedJwt(payload: Record<string, unknown>) {
  const keyPair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const kid = `operational-coverage-${crypto.randomUUID()}`;
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

function unauthenticatedExchange(headers: HeadersInit = {}): Request {
  return new Request("https://noema.example/exchange", {
    method: "POST",
    headers,
  });
}

describe("operational helper coverage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["x-real-ip", "198.51.100.21"],
    ["x-forwarded-for", "198.51.100.22, 10.0.0.5"],
    ["cf-connecting-ip", "client id with spaces"],
  ])("derives a stable bounded rate-limit key from %s", async (headerName, headerValue) => {
    const env = { ...baseEnv, NOEMA_RATE_LIMIT_PER_MINUTE: "1" };
    const first = await worker.fetch(unauthenticatedExchange({ [headerName]: headerValue }), env);
    const second = await worker.fetch(unauthenticatedExchange({ [headerName]: headerValue }), env);

    expect(first.status).toBe(401);
    expect(second.status).toBe(429);
    expect(second.headers.get("retry-after")).toBeTruthy();
  });

  it.each(["NaN", "0", "0.5"])("fails safely to the default rate limit for %s", async (configuredLimit) => {
    const response = await worker.fetch(
      unauthenticatedExchange({ "cf-connecting-ip": `limit_${configuredLimit.replace(".", "_")}` }),
      { ...baseEnv, NOEMA_RATE_LIMIT_PER_MINUTE: configuredLimit },
    );

    expect(response.status).toBe(401);
  });

  it("starts a fresh rate-limit window after the previous bucket expires", async () => {
    const now = 1_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    const env = { ...baseEnv, NOEMA_RATE_LIMIT_PER_MINUTE: "1" };
    const request = () => unauthenticatedExchange({ "cf-connecting-ip": "expiry_client" });

    const first = await worker.fetch(request(), env);
    vi.spyOn(Date, "now").mockReturnValue(now + 60_001);
    const second = await worker.fetch(request(), env);

    expect(first.status).toBe(401);
    expect(second.status).toBe(401);
  });

  it("reclaims stale client buckets after high-cardinality pressure", async () => {
    const initialNow = 2_000_000;
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(Date, "now").mockReturnValue(initialNow);

    for (let index = 0; index <= 10_000; index += 1) {
      const response = await worker.fetch(
        unauthenticatedExchange({ "cf-connecting-ip": `pressure_${index}` }),
        baseEnv,
      );
      expect(response.status).toBe(401);
    }

    vi.spyOn(Date, "now").mockReturnValue(initialNow + 60_001);
    const fresh = await worker.fetch(
      unauthenticatedExchange({ "cf-connecting-ip": "pressure_fresh" }),
      baseEnv,
    );

    expect(fresh.status).toBe(401);
  });

  it("reports null and array target_repository input types without minting a GitHub token", async () => {
    const now = Math.floor(Date.now() / 1000);
    const { token, jwk } = await createSignedJwt({
      iss: baseEnv.ALLOWED_ISSUER,
      aud: baseEnv.ALLOWED_AUDIENCE,
      repository_owner: baseEnv.ALLOWED_REPOSITORY_OWNER,
      repository: "ContextualWisdomLab/.github",
      job_workflow_ref: "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main",
      sub: "repo:ContextualWisdomLab/.github:ref:refs/heads/main",
      exp: now + 300,
      nbf: now - 30,
      iat: now - 30,
    });
    const networkRequests: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      networkRequests.push(url);
      if (url === "https://token.actions.githubusercontent.com/.well-known/openid-configuration") {
        return Response.json({ jwks_uri: "https://token.actions.githubusercontent.com/.well-known/jwks" });
      }
      if (url === "https://token.actions.githubusercontent.com/.well-known/jwks") {
        return Response.json({ keys: [jwk] });
      }
      return new Response("unexpected GitHub call", { status: 500 });
    });

    for (const [targetRepository, receivedType] of [[null, "null"], [[], "array"]] as const) {
      const response = await worker.fetch(new Request("https://noema.example/exchange", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "cf-connecting-ip": `value_type_${receivedType}`,
        },
        body: JSON.stringify({ target_repository: targetRepository }),
      }), baseEnv);

      expect(response.status).toBe(400);
      const payload = await response.json();
      expect(payload).toMatchObject({
        ok: false,
        error_code: "ERR_VALIDATION_INPUT",
        details: {
          field: "target_repository",
          reason: "must be a string",
          received_type: receivedType,
        },
      });
    }

    expect(networkRequests.some((url) => url.includes("api.github.com"))).toBe(false);
  });
});
