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

function encodeJsonSegment(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
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

  it("does not derive workflow-source policy from replacement-decoded invalid UTF-8 payload bytes", async () => {
    const token = `${encodeJsonSegment({ alg: "RS256", kid: "invalid-utf8-prefilter" })}.${invalidUtf8WorkflowPayloadSegment()}.AA`;
    const response = await worker.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: {
          "cf-connecting-ip": "203.0.113.126",
          authorization: `Bearer ${token}`,
        },
      }),
      env,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_TOKEN_MALFORMED",
    });
  });
});
