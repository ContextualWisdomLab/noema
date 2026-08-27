import { describe, expect, it, vi } from "vitest";
import entrypoint, { type Env } from "../src/entrypoint";

describe("public entrypoint trace authority", () => {
  it("does not normalize non-ASCII whitespace into a trusted request id", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const response = await entrypoint.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: {
          "x-request-id": "\u00a0request.trace-123\u00a0",
          "x-correlation-id": "correlation:trace_456",
        },
      }),
      { GITHUB_API_BASE: "https://api.github.com" } as Env,
    );

    expect(response.status).toBe(503);
    const payload = await response.json() as { trace_id: string };
    expect(payload.trace_id).toBe("correlation:trace_456");
    expect(response.headers.get("x-trace-id")).toBe("correlation:trace_456");
  });
});
