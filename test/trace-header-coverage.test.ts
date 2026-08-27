import { describe, expect, it } from "vitest";
import worker, { type Env } from "../src/index";

const env = {} as Env;

describe("trace header selection", () => {
  it("uses a valid request id as the response trace identity", async () => {
    const response = await worker.fetch(new Request("https://noema.example/health", {
      headers: { "x-request-id": "request.trace-123" },
    }), env);

    expect(response.status).toBe(200);
    const payload = await response.json() as { trace_id: string };
    expect(payload.trace_id).toBe("request.trace-123");
    expect(response.headers.get("x-trace-id")).toBe("request.trace-123");
  });

  it("falls back to a valid correlation id when request id contains unsafe characters", async () => {
    const response = await worker.fetch(new Request("https://noema.example/health", {
      headers: {
        "x-request-id": "unsafe request id",
        "x-correlation-id": "correlation:trace_456",
      },
    }), env);

    expect(response.status).toBe(200);
    const payload = await response.json() as { trace_id: string };
    expect(payload.trace_id).toBe("correlation:trace_456");
    expect(response.headers.get("x-trace-id")).toBe("correlation:trace_456");
  });
});