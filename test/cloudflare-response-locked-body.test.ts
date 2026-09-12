import { describe, expect, it } from "vitest";
import { readBoundedCloudflareJsonResponse } from "../scripts/lib/cloudflare-response.mjs";

describe("Cloudflare control-plane locked response bodies", () => {
  it("normalizes reader-acquisition failure instead of leaking a raw stream exception", async () => {
    const response = new Response(JSON.stringify({ success: true, result: { id: "locked" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    const heldReader = response.body!.getReader();

    try {
      await expect(
        readBoundedCloudflareJsonResponse(response, "Worker status"),
      ).rejects.toThrow("Worker status response body is not stream-readable");
    } finally {
      heldReader.releaseLock();
    }
  });
});
