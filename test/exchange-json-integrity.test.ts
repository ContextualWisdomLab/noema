import { describe, expect, it } from "vitest";
import { boundExchangeJsonBody } from "../src/entrypoint";

describe("exchange JSON integrity", () => {
  it("rejects duplicate decoded object keys before credential-bearing work", async () => {
    const request = new Request("https://noema.example/exchange", {
      method: "POST",
      headers: {
        authorization: "Bearer a.b.c",
        "content-type": "application/json",
      },
      body: '{"target_repository":"ContextualWisdomLab/noema","target_reposit\\u006fry":"ContextualWisdomLab/other"}',
    });

    await expect(boundExchangeJsonBody(request)).resolves.toEqual({
      ok: false,
      failure: { reason: "duplicate_keys", status: 400 },
    });
  });
});
