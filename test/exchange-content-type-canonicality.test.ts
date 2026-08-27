import { describe, expect, it } from "vitest";
import { boundExchangeJsonBody } from "../src/entrypoint";

describe("exchange Content-Type canonicality", () => {
  it("rejects non-HTTP whitespace around application/json instead of normalizing it", async () => {
    const request = new Request("https://noema.example/exchange", {
      method: "POST",
      headers: {
        "content-type": "\u00a0application/json\u00a0",
      },
      body: "{}",
    });

    expect(request.headers.get("content-type")).toBe("\u00a0application/json\u00a0");
    await expect(boundExchangeJsonBody(request)).resolves.toEqual({
      ok: false,
      failure: {
        reason: "unsupported_media_type",
        status: 415,
      },
    });
  });

  it("continues accepting HTTP OWS and case-insensitive application/json media types", async () => {
    const request = new Request("https://noema.example/exchange", {
      method: "POST",
      headers: {
        "content-type": "Application/JSON \t; charset=utf-8",
      },
      body: "{}",
    });

    const result = await boundExchangeJsonBody(request);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected bounded JSON request");
    await expect(result.request.json()).resolves.toEqual({});
  });
});
