import { afterEach, describe, expect, it, vi } from "vitest";
import entrypoint, {
  boundExchangeJsonBody,
  type Env,
} from "../src/entrypoint";
import {
  resetGlobalOutboundFetchPolicy,
  type FetchHost,
} from "../src/outbound-fetch-policy";

const nativeFetch = globalThis.fetch;

function jsonRequest(body: string, requestId?: string): Request {
  return new Request("https://noema.example/exchange", {
    method: "POST",
    headers: {
      authorization: "Bearer a.b.c",
      "content-type": "application/json",
      ...(requestId ? { "x-request-id": requestId } : {}),
    },
    body,
  });
}

describe("exchange JSON integrity", () => {
  afterEach(() => {
    resetGlobalOutboundFetchPolicy();
    (globalThis as FetchHost).fetch = nativeFetch;
    vi.restoreAllMocks();
  });

  it("rejects duplicate decoded target_repository keys before credential-bearing work", async () => {
    const request = jsonRequest(
      '{"target_repository" : "ContextualWisdomLab/noema","target_reposit\\u006fry" : "ContextualWisdomLab/other"}',
    );

    await expect(boundExchangeJsonBody(request)).resolves.toEqual({
      ok: false,
      failure: { reason: "duplicate_keys", status: 400 },
    });
  });

  it("does not classify unrelated JSON member names as target_repository", async () => {
    const result = await boundExchangeJsonBody(jsonRequest('{"metadata":"target_repository"}'));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected bounded request");
    await expect(result.request.json()).resolves.toEqual({ metadata: "target_repository" });
  });

  it("does not classify nested target_repository members as duplicate top-level keys", async () => {
    const result = await boundExchangeJsonBody(jsonRequest(
      '{"target_repository":"ContextualWisdomLab/noema","metadata":{"target_repository":"nested-value"}}',
    ));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected bounded request");
    await expect(result.request.json()).resolves.toEqual({
      target_repository: "ContextualWisdomLab/noema",
      metadata: { target_repository: "nested-value" },
    });
  });

  it("does not classify target_repository members nested below arrays as top-level duplicates", async () => {
    const result = await boundExchangeJsonBody(jsonRequest(
      '{"target_repository":"ContextualWisdomLab/noema","metadata":[{"target_repository":"nested-value"}]}',
    ));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected bounded request");
    await expect(result.request.json()).resolves.toEqual({
      target_repository: "ContextualWisdomLab/noema",
      metadata: [{ target_repository: "nested-value" }],
    });
  });

  it("leaves malformed key escapes for the existing downstream JSON parser", async () => {
    const result = await boundExchangeJsonBody(jsonRequest('{"\\x":"value"}'));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected bounded request");
    await expect(result.request.text()).resolves.toBe('{"\\x":"value"}');
  });

  it("accepts the application/json media-type token case-insensitively with ordinary parameters", async () => {
    const request = new Request("https://noema.example/exchange", {
      method: "POST",
      headers: {
        authorization: "Bearer a.b.c",
        "content-type": "Application/JSON; charset=utf-8",
      },
      body: '{"target_repository":"ContextualWisdomLab/noema"}',
    });

    const result = await boundExchangeJsonBody(request);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected bounded request");
    await expect(result.request.json()).resolves.toEqual({
      target_repository: "ContextualWisdomLab/noema",
    });
  });

  it("rejects misleading non-JSON media types before credential-bearing work", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const request = new Request("https://noema.example/exchange", {
      method: "POST",
      headers: {
        authorization: "Bearer a.b.c",
        "content-type": "text/plain; profile=application/json",
        "x-request-id": "misleading-media-type",
      },
      body: '{"target_repository":"ContextualWisdomLab/other"}',
    });

    const response = await entrypoint.fetch(
      request,
      { GITHUB_API_BASE: "https://example.invalid" } as Env,
    );

    expect(response.status).toBe(415);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-trace-id")).toBe("misleading-media-type");
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_VALIDATION_INPUT",
      message: "Exchange request body requires application/json",
      details: {
        policy: "bounded-exchange-json-body",
        body_limit_bytes: "8192",
        reason: "unsupported_media_type",
      },
      trace_id: "misleading-media-type",
    });
    expect(globalThis.fetch).toBe(nativeFetch);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('"reason":"unsupported_media_type"'));
  });

  it("returns a no-store duplicate-key response before GitHub egress configuration", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const response = await entrypoint.fetch(
      jsonRequest(
        '{"target_repository":"ContextualWisdomLab/noema","target_reposit\\u006fry":"ContextualWisdomLab/other"}',
        "duplicate-target",
      ),
      { GITHUB_API_BASE: "https://example.invalid" } as Env,
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-trace-id")).toBe("duplicate-target");
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_VALIDATION_INPUT",
      message: "Exchange JSON body contains duplicate target_repository keys",
      details: {
        policy: "bounded-exchange-json-body",
        body_limit_bytes: "8192",
        reason: "duplicate_keys",
      },
      trace_id: "duplicate-target",
    });
    expect(globalThis.fetch).toBe(nativeFetch);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('"reason":"duplicate_keys"'));
  });
});
