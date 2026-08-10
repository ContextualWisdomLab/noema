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

async function expectMethodNotAllowed(response: Response): Promise<void> {
  expect(response.status).toBe(405);
  expect(response.headers.get("allow")).toBe("POST");
  expect(await response.json()).toMatchObject({
    ok: false,
    error_code: "ERR_VALIDATION_INPUT",
    message: "Method not allowed",
    details: {
      allowed_methods: "POST",
      hint: expect.any(String),
    },
  });
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
