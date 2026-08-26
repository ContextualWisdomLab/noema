import { afterEach, describe, expect, it, vi } from "vitest";

const base64UrlAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const canonicalHeader = Buffer.from(JSON.stringify({ alg: "RS256", kid: "kid" })).toString("base64url");
const canonicalPayload = Buffer.from(JSON.stringify({ sub: "repo:ContextualWisdomLab/noema" })).toString("base64url");

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

const env = {
  ALLOWED_ISSUER: "https://token.actions.githubusercontent.com",
  ALLOWED_AUDIENCE: "cwl-noema-review",
  ALLOWED_REPOSITORY_OWNER: "ContextualWisdomLab",
  ALLOWED_WORKFLOW_REPOSITORY: "ContextualWisdomLab/.github",
  ALLOWED_WORKFLOW_REF_PREFIX:
    "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main",
  ALLOWED_WORKFLOW_SHA: "a".repeat(40),
  GITHUB_API_BASE: "https://api.github.com",
  GITHUB_APP_ID: "1",
  GITHUB_APP_PRIVATE_KEY_PEM: "unused",
  NOEMA_RATE_LIMIT_PER_MINUTE: "1000",
  NOEMA_RATE_LIMITER: allowingRateLimiter(),
};

function sameBytesNonCanonicalBase64Url(segment: string): string {
  if (segment.length % 4 !== 2 && segment.length % 4 !== 3) {
    throw new Error("fixture requires an unpadded base64url tail");
  }
  const lastIndex = base64UrlAlphabet.indexOf(segment.at(-1) ?? "");
  if (lastIndex < 0) throw new Error("fixture tail must be base64url");
  return `${segment.slice(0, -1)}${base64UrlAlphabet[lastIndex + 1]}`;
}

async function requestThroughWorkerWithParserRegression(token: string): Promise<Response> {
  vi.resetModules();
  vi.doMock("../src/bearer-authorization", () => ({
    parseExactBearerToken: () => token,
  }));
  vi.doMock("../src/index", () => ({
    default: {
      fetch: async () => new Response(JSON.stringify({
        ok: false,
        error_code: "ERR_TOKEN_MALFORMED",
        message: "authoritative parser rejected the token",
        trace_id: "downstream-defense",
      }), {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
      }),
    },
  }));
  const { default: worker } = await import("../src/worker");

  return worker.fetch(
    new Request("https://noema.example/exchange", {
      method: "POST",
      headers: {
        authorization: "Bearer ignored-by-regression-seam",
        "cf-connecting-ip": "203.0.113.126",
      },
    }),
    env,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock("../src/bearer-authorization");
  vi.doUnmock("../src/index");
  vi.resetModules();
});

describe("protected worker defense when the shared bearer parser regresses", () => {
  it("does not derive workflow claims from a non-three-segment token", async () => {
    const response = await requestThroughWorkerWithParserRegression(`${canonicalHeader}.${canonicalPayload}`);

    expect(response.status).toBe(400);
    expect(response.headers.get("x-rate-limit-scope")).toBe("distributed");
  });

  it("does not derive workflow claims from an oversized payload segment", async () => {
    const token = `${canonicalHeader}.${"A".repeat(8_193)}.AA`;
    const response = await requestThroughWorkerWithParserRegression(token);

    expect(response.status).toBe(400);
    expect(response.headers.get("x-rate-limit-scope")).toBe("distributed");
  });

  it("does not derive workflow claims from non-canonical base64url pad bits", async () => {
    const nonCanonicalPayload = sameBytesNonCanonicalBase64Url(canonicalPayload);
    expect(Buffer.from(nonCanonicalPayload, "base64url")).toEqual(Buffer.from(canonicalPayload, "base64url"));

    const response = await requestThroughWorkerWithParserRegression(
      `${canonicalHeader}.${nonCanonicalPayload}.AA`,
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("x-rate-limit-scope")).toBe("distributed");
  });

  it("does not derive workflow claims when the base64url decoder throws", async () => {
    const response = await requestThroughWorkerWithParserRegression(`${canonicalHeader}.%.AA`);

    expect(response.status).toBe(400);
    expect(response.headers.get("x-rate-limit-scope")).toBe("distributed");
  });
});
