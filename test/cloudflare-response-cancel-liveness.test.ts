import { describe, expect, it, vi } from "vitest";
import { readBoundedCloudflareJsonResponse } from "../scripts/lib/cloudflare-response.mjs";

function fakeResponse(reader: object): Response {
  return {
    body: { getReader: () => reader },
    status: 200,
    ok: true,
  } as unknown as Response;
}

describe("Cloudflare control-plane response cancellation liveness", () => {
  it("rejects an oversized response without waiting for cancellation cleanup to settle", async () => {
    let signalCancelStarted!: () => void;
    const cancelStarted = new Promise<void>((resolve) => {
      signalCancelStarted = resolve;
    });
    const releaseLock = vi.fn();
    const reader = {
      read: vi.fn().mockResolvedValueOnce({
        done: false,
        value: new Uint8Array([1, 2]),
      }),
      cancel: vi.fn(() => {
        signalCancelStarted();
        return new Promise<void>(() => undefined);
      }),
      releaseLock,
    };

    const operation = readBoundedCloudflareJsonResponse(
      fakeResponse(reader),
      "Worker recovery",
      1,
    );

    await cancelStarted;
    const outcome = await Promise.race([
      operation.then(
        () => ({ status: "resolved" as const }),
        (error: unknown) => ({ status: "rejected" as const, error }),
      ),
      new Promise<{ status: "timeout" }>((resolve) => {
        setTimeout(() => resolve({ status: "timeout" }), 100);
      }),
    ]);

    expect(outcome.status).toBe("rejected");
    if (outcome.status === "rejected") {
      expect(outcome.error).toBeInstanceOf(Error);
      expect((outcome.error as Error).message).toContain("oversized response");
    }
    expect(releaseLock).toHaveBeenCalledOnce();
  });
});
