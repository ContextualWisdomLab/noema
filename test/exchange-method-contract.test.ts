import { describe, expect, it } from "vitest";
import entrypoint, { type Env } from "../src/entrypoint";

function baseEnv(overrides: Partial<Env> = {}): Env {
  return {
    ALLOWED_ISSUER: "https://token.actions.githubusercontent.com",
    ALLOWED_AUDIENCE: "cwl-noema-review",
    ALLOWED_REPOSITORY_OWNER: "ContextualWisdomLab",
    ALLOWED_WORKFLOW_REPOSITORY: "ContextualWisdomLab/.github",
    ALLOWED_WORKFLOW_REF_PREFIX: "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main",
    GITHUB_API_BASE: "https://api.github.com",
    GITHUB_APP_ID: "1",
    GITHUB_APP_PRIVATE_KEY_PEM: "unused",
    NOEMA_RATE_LIMITER: {
      idFromName() {
        throw new Error("unsupported /exchange methods must not reach the distributed limiter");
      },
    } as unknown as DurableObjectNamespace,
    ...overrides,
  };
}

function expectMethodNotAllowedHeaders(response: Response): string {
  expect(response.status).toBe(405);
  expect(response.headers.get("allow")).toBe("POST");
  expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("pragma")).toBe("no-cache");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  const traceId = response.headers.get("x-trace-id");
  expect(traceId).toEqual(expect.any(String));
  return traceId as string;
}

async function expectMethodNotAllowed(response: Response): Promise<void> {
  const traceId = expectMethodNotAllowedHeaders(response);
  const body = await response.json() as Record<string, unknown>;
  expect(body).toMatchObject({
    ok: false,
    error_code: "ERR_VALIDATION_INPUT",
    message: "Method not allowed",
    details: {
      allowed_methods: "POST",
      hint: expect.any(String),
    },
  });
  expect(body.trace_id).toBe(traceId);
}

describe("exchange method contract", () => {
  it.each(["GET", "PUT", "PATCH", "DELETE", "OPTIONS"])(
    "returns 405 for %s /exchange before credential egress configuration",
    async (method) => {
      const response = await entrypoint.fetch(
        new Request("https://noema.example/exchange", {
          method,
          headers: { "cf-connecting-ip": "203.0.113.10" },
        }),
        baseEnv({ GITHUB_API_BASE: "https://example.invalid" }),
      );

      await expectMethodNotAllowed(response);
    },
  );

  it("returns a bodyless 405 for HEAD /exchange before credential egress configuration", async () => {
    const response = await entrypoint.fetch(
      new Request("https://noema.example/exchange", {
        method: "HEAD",
        headers: { "cf-connecting-ip": "203.0.113.10" },
      }),
      baseEnv({ GITHUB_API_BASE: "https://example.invalid" }),
    );

    expectMethodNotAllowedHeaders(response);
    expect(await response.text()).toBe("");
  });

  it("does not consume distributed rate-limit capacity for an unsupported method", async () => {
    let rateLimitCalls = 0;
    const env = baseEnv({
      NOEMA_RATE_LIMITER: {
        idFromName() {
          rateLimitCalls += 1;
          throw new Error("distributed limiter should be unreachable");
        },
      } as unknown as DurableObjectNamespace,
    });

    const response = await entrypoint.fetch(
      new Request("https://noema.example/exchange", {
        method: "PUT",
        headers: { "cf-connecting-ip": "203.0.113.10" },
      }),
      env,
    );

    await expectMethodNotAllowed(response);
    expect(rateLimitCalls).toBe(0);
  });
});
