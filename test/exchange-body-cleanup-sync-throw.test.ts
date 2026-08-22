import { describe, expect, it } from "vitest";
import { boundExchangeJsonBody } from "../src/entrypoint";

describe("exchange request-body cleanup defensive boundary", () => {
  it("preserves an already-decided unsupported-media rejection if host cancellation throws synchronously", async () => {
    const request = new Request("https://noema.example/exchange", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "ignored",
    });
    if (request.body === null) throw new Error("expected request body");
    Object.defineProperty(request.body, "cancel", {
      configurable: true,
      value() {
        throw new Error("synthetic host cancellation failure");
      },
    });

    await expect(boundExchangeJsonBody(request)).resolves.toEqual({
      ok: false,
      failure: { reason: "unsupported_media_type", status: 415 },
    });
  });
});
