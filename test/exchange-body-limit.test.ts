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
const validEnvelope = "Bearer a.b.c";

function streamedJsonRequest(stream: ReadableStream<Uint8Array>, headers: HeadersInit = {}): Request {
  return new Request("https://noema.example/exchange", {
    method: "POST",
    headers: {
      authorization: validEnvelope,
      "content-type": "application/json",
      ...headers,
    },
    body: stream,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

describe("exchange JSON body boundary", () => {
  afterEach(() => {
    resetGlobalOutboundFetchPolicy();
    (globalThis as FetchHost).fetch = nativeFetch;
    vi.restoreAllMocks();
  });

  it("leaves other methods and bodyless JSON requests untouched while rejecting non-JSON bodies", async () => {
    const getRequest = new Request("https://noema.example/exchange", {
      method: "GET",
      headers: { "content-type": "application/json" },
    });
    const textRequest = new Request("https://noema.example/exchange", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "ignored",
    });
    const bodylessRequest = new Request("https://noema.example/exchange", {
      method: "POST",
      headers: { "content-type": "application/json" },
    });

    await expect(boundExchangeJsonBody(getRequest)).resolves.toEqual({ ok: true, request: getRequest });
    await expect(boundExchangeJsonBody(textRequest)).resolves.toEqual({
      ok: false,
      failure: { reason: "unsupported_media_type", status: 415 },
    });
    await expect(boundExchangeJsonBody(bodylessRequest)).resolves.toEqual({ ok: true, request: bodylessRequest });
  });

  it("rejects a declared body above the byte budget", async () => {
    const request = new Request("https://noema.example/exchange", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": "8193",
      },
      body: "{}",
    });

    await expect(boundExchangeJsonBody(request)).resolves.toEqual({
      ok: false,
      failure: { reason: "too_large", status: 413 },
    });
  });

  it("streams and rebuilds an exact-limit body while removing untrusted length metadata", async () => {
    const body = "x".repeat(8_192);
    const request = new Request("https://noema.example/exchange", {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-length": "8192",
        "x-request-id": "body-boundary",
      },
      body,
      redirect: "manual",
    });
    const result = await boundExchangeJsonBody(request);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected bounded request");
    expect(result.request).not.toBe(request);
    expect(result.request.headers.get("content-length")).toBeNull();
    expect(result.request.headers.get("x-request-id")).toBe("body-boundary");
    expect(result.request.redirect).toBe("manual");
    await expect(result.request.text()).resolves.toBe(body);
  });

  it("streams a body when Content-Length is malformed rather than trusting it", async () => {
    const request = new Request("https://noema.example/exchange", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": "unknown",
      },
      body: "{}",
    });
    const result = await boundExchangeJsonBody(request);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected bounded request");
    await expect(result.request.text()).resolves.toBe("{}");
  });

  it("rebuilds an explicitly empty streamed body", async () => {
    const request = streamedJsonRequest(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      },
    }));
    const result = await boundExchangeJsonBody(request);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected bounded request");
    await expect(result.request.arrayBuffer()).resolves.toHaveProperty("byteLength", 0);
  });

  it("rejects an undeclared streamed body one byte over the budget", async () => {
    const request = new Request("https://noema.example/exchange", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "x".repeat(8_193),
    });

    await expect(boundExchangeJsonBody(request)).resolves.toEqual({
      ok: false,
      failure: { reason: "too_large", status: 413 },
    });
  });

  it("keeps the rejection deterministic when stream cancellation fails", async () => {
    let emitted = false;
    const request = streamedJsonRequest(new ReadableStream<Uint8Array>({
      pull(controller) {
        if (emitted) return;
        emitted = true;
        controller.enqueue(new Uint8Array(8_193));
      },
      cancel() {
        throw new Error("cancel unavailable");
      },
    }));

    await expect(boundExchangeJsonBody(request)).resolves.toEqual({
      ok: false,
      failure: { reason: "too_large", status: 413 },
    });
  });

  it("maps request stream failures to an unreadable body decision", async () => {
    const request = streamedJsonRequest(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error("stream failed"));
      },
    }));

    await expect(boundExchangeJsonBody(request)).resolves.toEqual({
      ok: false,
      failure: { reason: "unreadable", status: 400 },
    });
  });

  it("returns a no-store 413 before egress installation for a declared oversized body", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const response = await entrypoint.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: {
          authorization: validEnvelope,
          "content-type": "application/json",
          "content-length": "8193",
          "x-request-id": "oversized-body",
        },
        body: '{"target_repository":"sensitive-marker"}',
      }),
      { GITHUB_API_BASE: "https://api.github.com" } as Env,
    );

    expect(response.status).toBe(413);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-trace-id")).toBe("oversized-body");
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_VALIDATION_INPUT",
      message: "Exchange JSON body exceeds accepted bounds",
      details: {
        policy: "bounded-exchange-json-body",
        body_limit_bytes: "8192",
        reason: "too_large",
      },
      trace_id: "oversized-body",
    });
    expect(globalThis.fetch).toBe(nativeFetch);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('"event":"exchange_json_body"'));
    expect(logSpy.mock.calls.flat().join("\n")).not.toContain("sensitive-marker");
  });

  it("returns 413 for a chunked oversized body without relying on Content-Length", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const response = await entrypoint.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: {
          authorization: validEnvelope,
          "content-type": "application/json",
        },
        body: "x".repeat(8_193),
      }),
      { GITHUB_API_BASE: "https://api.github.com" } as Env,
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error_code: "ERR_VALIDATION_INPUT",
      details: { reason: "too_large" },
    });
    expect(globalThis.fetch).toBe(nativeFetch);
  });

  it("returns a bounded 400 response when the request stream is unreadable", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const response = await entrypoint.fetch(
      streamedJsonRequest(new ReadableStream<Uint8Array>({
        start(controller) {
          controller.error(new Error("stream failed"));
        },
      }), { "x-request-id": "unreadable-body" }),
      { GITHUB_API_BASE: "https://api.github.com" } as Env,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_VALIDATION_INPUT",
      message: "Exchange JSON body could not be read",
      details: {
        policy: "bounded-exchange-json-body",
        reason: "unreadable",
      },
      trace_id: "unreadable-body",
    });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('"reason":"unreadable"'));
    expect(globalThis.fetch).toBe(nativeFetch);
  });

  it("keeps the fail-closed body response available when logging fails", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {
      throw new Error("log sink unavailable");
    });
    const response = await entrypoint.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: {
          authorization: validEnvelope,
          "content-type": "application/json",
          "content-length": "8193",
        },
        body: "{}",
      }),
      { GITHUB_API_BASE: "https://api.github.com" } as Env,
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error_code: "ERR_VALIDATION_INPUT",
      details: { policy: "bounded-exchange-json-body" },
    });
  });

  it("allows a small JSON body to continue into the existing egress gate", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const response = await entrypoint.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: {
          authorization: validEnvelope,
          "content-type": "application/json",
        },
        body: '{"target_repository":"ContextualWisdomLab/noema"}',
      }),
      { GITHUB_API_BASE: "https://example.com", GITHUB_APP_ID: "123456" } as Env,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error_code: "ERR_GITHUB_API",
      details: { policy: "github-cloud-exact-origin" },
    });
  });
});
