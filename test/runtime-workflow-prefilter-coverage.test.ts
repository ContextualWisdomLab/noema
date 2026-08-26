import { describe, expect, it } from "vitest";
import worker, { type Env } from "../src/runtime-entrypoint";

function allowingRateLimiter(): DurableObjectNamespace {
  return {
    idFromName(name: string) {
      return { toString: () => name } as DurableObjectId;
    },
    get() {
      return {
        async fetch() {
          return Response.json({
            allowed: true,
            limit: 1000,
            remaining: 999,
            retry_after_seconds: 0,
          });
        },
      } as unknown as DurableObjectStub;
    },
  } as unknown as DurableObjectNamespace;
}

function denyingRateLimiter(onFetch: () => void): DurableObjectNamespace {
  return {
    idFromName(name: string) {
      return { toString: () => name } as DurableObjectId;
    },
    get() {
      return {
        async fetch() {
          onFetch();
          return Response.json({
            allowed: false,
            limit: 1,
            remaining: 0,
            retry_after_seconds: 60,
          });
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
  ALLOWED_WORKFLOW_REF_PREFIX:
    "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main",
  ALLOWED_WORKFLOW_SHA: "a".repeat(40),
  GITHUB_API_BASE: "https://api.github.com",
  GITHUB_APP_ID: "1",
  GITHUB_APP_PRIVATE_KEY_PEM: "unused-before-authentication",
  NOEMA_RATE_LIMIT_PER_MINUTE: "1000",
  NOEMA_RATE_LIMITER: allowingRateLimiter(),
};

const base64UrlAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function encodeJsonSegment(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function workflowIdentityPayloadSegment(): string {
  let padding = "";
  while (true) {
    const segment = encodeJsonSegment({
      job_workflow_ref: env.ALLOWED_WORKFLOW_REF_PREFIX,
      job_workflow_sha: "b".repeat(40),
      padding,
    });
    if (segment.length % 4 === 2 || segment.length % 4 === 3) return segment;
    padding += "x";
  }
}

function sameBytesNonCanonicalBase64Url(segment: string): string {
  if (segment.length % 4 !== 2 && segment.length % 4 !== 3) {
    throw new Error("fixture requires an unpadded base64url tail");
  }
  const lastIndex = base64UrlAlphabet.indexOf(segment.at(-1) ?? "");
  if (lastIndex < 0) throw new Error("fixture tail must be base64url");
  return `${segment.slice(0, -1)}${base64UrlAlphabet[lastIndex + 1]}`;
}

function invalidUtf8WorkflowPayloadSegment(): string {
  const marker = "__INVALID_UTF8__";
  const serialized = Buffer.from(JSON.stringify({
    job_workflow_ref: env.ALLOWED_WORKFLOW_REF_PREFIX,
    job_workflow_sha: "b".repeat(40),
    padding: marker,
  }), "utf8");
  const markerBytes = Buffer.from(marker, "utf8");
  const offset = serialized.indexOf(markerBytes);
  if (offset < 0) throw new Error("invalid UTF-8 marker missing from fixture");
  return Buffer.concat([
    serialized.subarray(0, offset),
    Buffer.from([0xff]),
    serialized.subarray(offset + markerBytes.length),
  ]).toString("base64url");
}

async function exchangeWithPayloadSegment(payloadSegment: string, kid: string): Promise<Response> {
  const token = `${encodeJsonSegment({ alg: "RS256", kid })}.${payloadSegment}.AA`;
  return worker.fetch(
    new Request("https://noema.example/exchange", {
      method: "POST",
      headers: {
        "cf-connecting-ip": "203.0.113.126",
        authorization: `Bearer ${token}`,
      },
    }),
    env,
  );
}

async function expectMissingAuth(headers: Record<string, string> = {}): Promise<void> {
  const response = await worker.fetch(
    new Request("https://noema.example/exchange", {
      method: "POST",
      headers: {
        "cf-connecting-ip": "203.0.113.126",
        ...headers,
      },
    }),
    env,
  );

  expect(response.status).toBe(401);
  await expect(response.json()).resolves.toMatchObject({
    ok: false,
    error_code: "ERR_AUTH_MISSING",
  });
  expect(response.headers.get("www-authenticate")).toBe(
    'Bearer realm="noema", error="invalid_request"',
  );
}

describe("runtime workflow-source prefilter coverage", () => {
  it("delegates an exchange request without bearer credentials to the authoritative auth boundary", async () => {
    await expectMissingAuth();
  });

  it("rejects whitespace-only Bearer credentials as a malformed bounded JWT envelope", async () => {
    const response = await worker.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: {
          "cf-connecting-ip": "203.0.113.126",
          authorization: "Bearer    ",
        },
      }),
      env,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_TOKEN_MALFORMED",
      details: { policy: "bounded-oidc-jwt-envelope" },
    });
  });

  it("routes forged workflow-source claims through distributed rate limiting before trust rejection", async () => {
    let limiterCalls = 0;
    const rateLimitedEnv: Env = {
      ...env,
      NOEMA_RATE_LIMITER: denyingRateLimiter(() => {
        limiterCalls += 1;
      }),
    };
    const token = `${encodeJsonSegment({ alg: "RS256", kid: "forged-stale-source" })}.${encodeJsonSegment({
      job_workflow_ref: env.ALLOWED_WORKFLOW_REF_PREFIX,
      job_workflow_sha: "b".repeat(40),
      jti: "forged-stale-source",
      exp: Math.floor(Date.now() / 1000) + 300,
    })}.AA`;

    const response = await worker.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: {
          "cf-connecting-ip": "203.0.113.126",
          authorization: `Bearer ${token}`,
        },
      }),
      rateLimitedEnv,
    );

    expect(limiterCalls).toBe(1);
    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_RATE_LIMIT",
      details: { scope: "distributed" },
    });
  });

  it("does not derive workflow-source policy from replacement-decoded invalid UTF-8 payload bytes", async () => {
    const response = await exchangeWithPayloadSegment(
      invalidUtf8WorkflowPayloadSegment(),
      "invalid-utf8-prefilter",
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_TOKEN_MALFORMED",
    });
  });

  it("does not derive workflow-source policy from padded base64url payload authority", async () => {
    const response = await exchangeWithPayloadSegment(
      `${workflowIdentityPayloadSegment()}=`,
      "padded-base64url-prefilter",
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_TOKEN_MALFORMED",
    });
  });

  it("does not derive workflow-source policy from non-canonical base64url pad bits", async () => {
    const canonical = workflowIdentityPayloadSegment();
    const nonCanonical = sameBytesNonCanonicalBase64Url(canonical);
    expect(Buffer.from(nonCanonical, "base64url")).toEqual(Buffer.from(canonical, "base64url"));

    const response = await exchangeWithPayloadSegment(
      nonCanonical,
      "pad-bit-base64url-prefilter",
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_TOKEN_MALFORMED",
    });
  });
});
