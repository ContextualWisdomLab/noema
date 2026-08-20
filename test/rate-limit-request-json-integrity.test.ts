import { describe, expect, it, vi } from "vitest";
import { NoemaRateLimiter } from "../src/rate-limit";

function stateWithObservedTransaction(transaction: ReturnType<typeof vi.fn>): DurableObjectState {
  return {
    storage: { transaction },
  } as unknown as DurableObjectState;
}

function requestWithRawBody(body: string): Request {
  return new Request("https://noema-rate-limit.internal/check", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("distributed rate-limit internal request JSON integrity", () => {
  it.each([
    '{"limit":1,"limit":10000}',
    '{"limit":1,"l\\u0069mit":10000}',
  ])("rejects duplicate decoded limit authority before storage: %s", async (body) => {
    const transaction = vi.fn(async () => {
      throw new Error("storage must not be reached for ambiguous limiter authority JSON");
    });
    const limiter = new NoemaRateLimiter(stateWithObservedTransaction(transaction));

    const response = await limiter.fetch(requestWithRawBody(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "malformed_json",
    });
    expect(transaction).not.toHaveBeenCalled();
  });
});
