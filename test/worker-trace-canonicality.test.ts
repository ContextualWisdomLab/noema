import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../src/worker";

function unavailableRateLimiter(): DurableObjectNamespace {
  return {
    idFromName(name: string) {
      return { toString: () => name } as DurableObjectId;
    },
    get() {
      return {
        fetch: async () => {
          throw new Error("distributed limiter unavailable");
        },
      } as unknown as DurableObjectStub;
    },
  } as unknown as DurableObjectNamespace;
}

describe("protected worker trace authority", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not normalize non-ASCII request-id bytes ahead of a canonical correlation id", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const response = await worker.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: {
          "cf-connecting-ip": "203.0.113.88",
          "x-request-id": "\u00a0normalized-request\u00a0",
          "x-correlation-id": "canonical-correlation",
        },
      }),
      {
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
        NOEMA_RATE_LIMITER: unavailableRateLimiter(),
      } as Env,
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("x-trace-id")).toBe("canonical-correlation");
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_RATE_LIMIT",
      trace_id: "canonical-correlation",
    });
  });
});
