import { describe, expect, it, vi } from "vitest";

import {
  createFailClosedFetch,
  type FetchLike,
} from "../src/outbound-fetch-policy";

describe("outbound response read authority", () => {
  it("fails closed when a trusted anonymous response body is already locked", async () => {
    const response = new Response(new ReadableStream<Uint8Array>());
    const heldReader = response.body!.getReader();
    const rawFetch = vi.fn<FetchLike>(async () => response);
    const wrapped = createFailClosedFetch(rawFetch);

    try {
      const result = await wrapped("https://api.github.com/meta");

      expect(rawFetch).toHaveBeenCalledTimes(1);
      expect(result.status).toBe(502);
      expect(result.headers.get("x-noema-egress-policy")).toBe("blocked-response-read");
    } finally {
      heldReader.releaseLock();
    }
  });

  it("releases the trusted response body reader lock after a successful bounded read", async () => {
    const payload = new TextEncoder().encode('{"ok":true}');
    const response = new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(payload);
        controller.close();
      },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    const rawFetch = vi.fn<FetchLike>(async () => response);
    const wrapped = createFailClosedFetch(rawFetch);

    const result = await wrapped("https://api.github.com/meta");

    expect(result.status).toBe(200);
    await expect(result.text()).resolves.toBe('{"ok":true}');
    const postReadReader = response.body!.getReader();
    postReadReader.releaseLock();
  });
});
