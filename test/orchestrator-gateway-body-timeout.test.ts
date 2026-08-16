import { describe, expect, it } from "vitest";

import { verifyOrchestratorHealthz } from "../scripts/lib/orchestrator-gateway.mjs";

describe("contextual-orchestrator health body timeout", () => {
  it("keeps the request timeout active while reading a stalled response body", async () => {
    let cancelled = false;
    let released = false;
    const reader = {
      read() {
        return new Promise<never>(() => undefined);
      },
      async cancel() {
        cancelled = true;
      },
      releaseLock() {
        released = true;
      },
    };
    const response = {
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: { getReader: () => reader },
    } as unknown as Response;

    await expect(
      verifyOrchestratorHealthz("https://orchestrator.example/healthz", {
        timeoutMs: 5,
        fetchImpl: (async () => response) as typeof fetch,
      }),
    ).rejects.toThrow(/health request failed: .*timed out/);

    expect(cancelled).toBe(true);
    expect(released).toBe(true);
  });
});
