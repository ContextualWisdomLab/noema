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
});
