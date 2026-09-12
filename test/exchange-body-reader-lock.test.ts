import { describe, expect, it } from "vitest";

import { boundExchangeJsonBody } from "../src/entrypoint";

function streamedJsonRequest(body: string): Request {
  const payload = new TextEncoder().encode(body);
  return new Request("https://noema.example/exchange", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(payload);
        controller.close();
      },
    }),
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

describe("exchange JSON body reader lifecycle", () => {
  it("releases the original request body reader lock after successful bounded consumption", async () => {
    const request = streamedJsonRequest('{"target_repository":"ContextualWisdomLab/noema"}');

    const result = await boundExchangeJsonBody(request);

    expect(result.ok).toBe(true);
    const postReadReader = request.body!.getReader();
    postReadReader.releaseLock();
  });
});
