import { afterEach, describe, expect, it, vi } from "vitest";

import { verifyOrchestratorHealthz } from "../scripts/lib/orchestrator-gateway.mjs";

afterEach(() => {
  vi.useRealTimers();
});

describe("contextual-orchestrator health body timeout", () => {
  it("keeps an explicit caller timeout active while reading a stalled response body", async () => {
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

  it("does not invent a default availability deadline when the caller provides none", async () => {
    vi.useFakeTimers();
    let resolveFetch!: (response: Response) => void;
    let observedSignal: AbortSignal | undefined;
    const fetchResponse = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const pending = verifyOrchestratorHealthz(
      "https://orchestrator.example/healthz",
      {
        fetchImpl: ((_: unknown, init?: RequestInit) => {
          observedSignal = init?.signal as AbortSignal | undefined;
          return fetchResponse;
        }) as typeof fetch,
      },
    );
    void pending.catch(() => undefined);

    await vi.advanceTimersByTimeAsync(15_001);
    expect(observedSignal?.aborted).toBe(false);

    const encoded = new TextEncoder().encode(
      JSON.stringify({ status: "ok", service: "contextual-orchestrator" }),
    );
    resolveFetch({
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: null,
      arrayBuffer: async () => encoded.buffer,
    } as unknown as Response);

    await expect(pending).resolves.toEqual({
      status: "ok",
      service: "contextual-orchestrator",
    });
  });
});
