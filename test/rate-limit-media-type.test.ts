import { describe, expect, it } from "vitest";
import { isJsonMediaType, NoemaRateLimiter } from "../src/rate-limit";

describe("rate limit media type", () => {
  it("accepts only application/json as the media type", () => {
    expect(isJsonMediaType("application/json")).toBe(true);
    expect(isJsonMediaType(" APPLICATION/JSON ; charset=utf-8")).toBe(true);
    expect(isJsonMediaType("text/plain; profile=application/json")).toBe(false);
    expect(isJsonMediaType(null)).toBe(false);
  });

  it("rejects a misleading JSON profile at the Durable Object boundary", async () => {
    const limiter = new NoemaRateLimiter({} as DurableObjectState);
    const response = await limiter.fetch(new Request("https://noema-rate-limit.internal/check", {
      method: "POST",
      headers: { "content-type": "text/plain; profile=application/json" },
      body: JSON.stringify({ limit: 60 }),
    }));

    expect(response.status).toBe(415);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "content_type_required",
    });
  });
});
