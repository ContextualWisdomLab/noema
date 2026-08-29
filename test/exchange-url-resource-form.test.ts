import { afterEach, describe, expect, it, vi } from "vitest";
import runtimeEntrypoint, { type Env } from "../src/runtime-entrypoint";
import {
  resetGlobalOutboundFetchPolicy,
  type FetchHost,
} from "../src/outbound-fetch-policy";

const nativeFetch = globalThis.fetch;

describe("exchange URL resource-form authority", () => {
  afterEach(() => {
    resetGlobalOutboundFetchPolicy();
    (globalThis as FetchHost).fetch = nativeFetch;
    vi.restoreAllMocks();
  });

  it("rejects a bare query delimiter before credential parsing or egress policy mutation", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const response = await runtimeEntrypoint.fetch(
      new Request("https://noema.example/exchange?", {
        method: "POST",
        headers: {
          authorization: "Bearer a.b.c",
          "x-request-id": "bare-query-delimiter",
        },
      }),
      {
        GITHUB_API_BASE: "https://example.invalid",
        GITHUB_APP_ID: "123456",
      } as Env,
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-trace-id")).toBe("bare-query-delimiter");
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_VALIDATION_INPUT",
      details: { policy: "exact-exchange-url" },
      trace_id: "bare-query-delimiter",
    });
    expect(globalThis.fetch).toBe(nativeFetch);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('"policy":"exact-exchange-url"'));
  });
});
