import { describe, expect, it, vi } from "vitest";
import { NoemaRateLimiter } from "../src/rate-limit";

function stateWithoutStorageAuthority(transaction: ReturnType<typeof vi.fn>): DurableObjectState {
  return {
    storage: { transaction },
  } as unknown as DurableObjectState;
}

function checkRequest(body: string, headers: HeadersInit = {}): Request {
  return new Request("https://noema-rate-limit.internal/check", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body,
  });
}

describe("distributed rate-limit internal request bounds", () => {
  it("rejects an oversized declared limit request before storage authority", async () => {
    const transaction = vi.fn(async () => {
      throw new Error("storage must not be reached for an oversized limiter request");
    });
    const limiter = new NoemaRateLimiter(stateWithoutStorageAuthority(transaction));

    const response = await limiter.fetch(checkRequest('{"limit":60}', {
      "content-length": "257",
    }));

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "request_too_large",
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects an oversized declared bodyless limit request without manufacturing cleanup work", async () => {
    const transaction = vi.fn(async () => {
      throw new Error("storage must not be reached for an oversized bodyless limiter request");
    });
    const limiter = new NoemaRateLimiter(stateWithoutStorageAuthority(transaction));
    const request = new Request("https://noema-rate-limit.internal/check", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": "257",
      },
    });

    const response = await limiter.fetch(request);

    expect(request.body).toBeNull();
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "request_too_large",
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects a bodyless JSON limit request as malformed before storage authority", async () => {
    const transaction = vi.fn(async () => {
      throw new Error("storage must not be reached for a bodyless limiter request");
    });
    const limiter = new NoemaRateLimiter(stateWithoutStorageAuthority(transaction));
    const request = new Request("https://noema-rate-limit.internal/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
    });

    const response = await limiter.fetch(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "malformed_json",
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects invalid UTF-8 limit request bytes before storage authority", async () => {
    const transaction = vi.fn(async () => {
      throw new Error("storage must not be reached for invalid UTF-8 limiter request bytes");
    });
    const limiter = new NoemaRateLimiter(stateWithoutStorageAuthority(transaction));
    const request = new Request("https://noema-rate-limit.internal/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: new Uint8Array([0xc3, 0x28]),
    });

    const response = await limiter.fetch(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "malformed_json",
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects a streamed limit request above the byte limit before storage authority", async () => {
    const transaction = vi.fn(async () => {
      throw new Error("storage must not be reached for an oversized limiter request");
    });
    const limiter = new NoemaRateLimiter(stateWithoutStorageAuthority(transaction));

    const response = await limiter.fetch(checkRequest(JSON.stringify({
      limit: 60,
      padding: "x".repeat(300),
    })));

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "request_too_large",
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("cleans up a request stream that fails while being read before storage authority", async () => {
    const transaction = vi.fn(async () => {
      throw new Error("storage must not be reached after an internal request read failure");
    });
    const limiter = new NoemaRateLimiter(stateWithoutStorageAuthority(transaction));
    const request = checkRequest('{"limit":60}');
    const cancel = vi.fn(async () => undefined);
    vi.spyOn(request.body!, "getReader").mockReturnValue({
      read: vi.fn(async () => {
        throw new Error("synthetic limiter request read failure");
      }),
      cancel,
    } as unknown as ReadableStreamDefaultReader<Uint8Array>);

    const response = await limiter.fetch(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "malformed_json",
    });
    expect(cancel).toHaveBeenCalledOnce();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("cleans up an unsupported-media-type body without letting cleanup failure replace 415", async () => {
    const transaction = vi.fn(async () => {
      throw new Error("storage must not be reached for an unsupported limiter request");
    });
    const limiter = new NoemaRateLimiter(stateWithoutStorageAuthority(transaction));
    const request = checkRequest('{"limit":60}', {
      "content-type": "text/plain",
    });
    const cancel = vi.spyOn(request.body!, "cancel").mockImplementation(() => {
      throw new Error("synthetic cancellation failure");
    });

    const response = await limiter.fetch(request);

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "content_type_required",
    });
    expect(cancel).toHaveBeenCalledOnce();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("cleans up a wrong-path body without letting cleanup failure replace 404", async () => {
    const transaction = vi.fn(async () => {
      throw new Error("storage must not be reached for a wrong-path limiter request");
    });
    const limiter = new NoemaRateLimiter(stateWithoutStorageAuthority(transaction));
    const request = new Request("https://noema-rate-limit.internal/not-check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"limit":60}',
    });
    const cancel = vi.spyOn(request.body!, "cancel").mockImplementation(() => {
      throw new Error("synthetic cancellation failure");
    });

    const response = await limiter.fetch(request);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "not_found",
    });
    expect(cancel).toHaveBeenCalledOnce();
    expect(transaction).not.toHaveBeenCalled();
  });
});