import { describe, expect, it } from "vitest";
import worker, { type Env } from "../src/runtime-entrypoint";

const env: Env = {
  ALLOWED_ISSUER: "https://token.actions.githubusercontent.com",
  ALLOWED_AUDIENCE: "cwl-noema-review",
  ALLOWED_REPOSITORY_OWNER: "ContextualWisdomLab",
  ALLOWED_WORKFLOW_REPOSITORY: "ContextualWisdomLab/.github",
  ALLOWED_WORKFLOW_REF_PREFIX: "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main",
  GITHUB_API_BASE: "https://api.github.com",
  GITHUB_APP_ID: "1",
  GITHUB_APP_PRIVATE_KEY_PEM: "unused",
};

describe("health method contract", () => {
  it("keeps GET /health as a liveness success", async () => {
    const response = await worker.fetch(new Request("https://noema.example/health"), env);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      data: { name: "noema" },
    });
  });

  it("preserves a canonical trace identity at the public runtime boundary", async () => {
    const response = await worker.fetch(new Request("https://noema.example/health", {
      headers: { "x-request-id": "request.trace-123" },
    }), env);

    expect(response.status).toBe(200);
    const payload = await response.json() as { trace_id: string };
    expect(payload.trace_id).toBe("request.trace-123");
    expect(response.headers.get("x-trace-id")).toBe("request.trace-123");
  });

  it("does not normalize non-ASCII whitespace into a trusted trace identity", async () => {
    const response = await worker.fetch(new Request("https://noema.example/health", {
      headers: {
        "x-request-id": "\u00a0request.trace-123\u00a0",
        "x-correlation-id": "correlation:trace_456",
      },
    }), env);

    expect(response.status).toBe(200);
    const payload = await response.json() as { trace_id: string };
    expect(payload.trace_id).toBe("correlation:trace_456");
    expect(response.headers.get("x-trace-id")).toBe("correlation:trace_456");
  });

  it("drops every non-canonical external trace header instead of normalizing it", async () => {
    const response = await worker.fetch(new Request("https://noema.example/health", {
      headers: {
        "x-request-id": "\u00a0request.trace-123\u00a0",
        "x-correlation-id": "\u00a0correlation:trace_456\u00a0",
      },
    }), env);

    expect(response.status).toBe(200);
    const payload = await response.json() as { trace_id: string };
    expect(payload.trace_id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(response.headers.get("x-trace-id")).toBe(payload.trace_id);
  });

  it.each(["HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])(
    "rejects %s /health instead of reporting false liveness",
    async (method) => {
      const response = await worker.fetch(
        new Request("https://noema.example/health", { method }),
        env,
      );

      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("GET");
      expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("pragma")).toBe("no-cache");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      const traceId = response.headers.get("x-trace-id");
      expect(traceId).toEqual(expect.any(String));
      const body = await response.json() as Record<string, unknown>;
      expect(body).toMatchObject({
        ok: false,
        error_code: "ERR_VALIDATION_INPUT",
        details: {
          allowed_methods: "GET",
          hint: expect.any(String),
        },
      });
      expect(body.trace_id).toBe(traceId);
    },
  );
});
