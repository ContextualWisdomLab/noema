import { afterEach, describe, expect, it, vi } from "vitest";

describe("continuation dispatch base-worker success telemetry", () => {
  afterEach(() => {
    vi.doUnmock("../src/continuation-dispatch/handler");
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("records an accepted broker response without fabricating an error code", async () => {
    const handleContinuationDispatch = vi.fn(async () => Response.json({
      ok: true,
      data: { receipt: { outcome: "accepted" } },
      trace_id: "continuation-success",
    }));
    vi.doMock("../src/continuation-dispatch/handler", async (importOriginal) => ({
      ...await importOriginal<typeof import("../src/continuation-dispatch/handler")>(),
      handleContinuationDispatch,
    }));
    const { default: worker } = await import("../src/index");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const response = await worker.fetch(
      new Request("https://noema.example/v1/continuation-dispatches", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": "continuation-success",
        },
        body: "{}",
      }),
      { NOEMA_RATE_LIMIT_PER_MINUTE: "1000" } as never,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-trace-id")).toBe("continuation-success");
    expect(handleContinuationDispatch).toHaveBeenCalledOnce();
    const record = JSON.parse(String(log.mock.calls.at(-1)?.[0])) as Record<string, unknown>;
    expect(record).toMatchObject({
      event: "http_request",
      route: "/v1/continuation-dispatches",
      method: "POST",
      status_code: 200,
      trace_id: "continuation-success",
    });
    expect(record).not.toHaveProperty("error_code");
  });
});
