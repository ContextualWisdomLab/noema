import { describe, expect, it, vi } from "vitest";

import { verifyOrchestratorHealthz } from "../scripts/lib/orchestrator-gateway.mjs";

describe("contextual-orchestrator streamed health response", () => {
  it("stops a chunked response at the byte ceiling without arrayBuffer materialization", async () => {
    let readCount = 0;
    let cancelled = false;
    let released = false;
    let arrayBufferCalled = false;
    const reader = {
      async read() {
        readCount += 1;
        if (readCount === 1) {
          return { done: false, value: new Uint8Array(65_536) };
        }
        if (readCount === 2) {
          return { done: false, value: new Uint8Array(1) };
        }
        throw new Error("reader continued after the configured byte ceiling");
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
      async arrayBuffer() {
        arrayBufferCalled = true;
        throw new Error("unbounded arrayBuffer materialization");
      },
    } as unknown as Response;

    await expect(
      verifyOrchestratorHealthz("https://orchestrator.example/healthz", {
        fetchImpl: (async () => response) as typeof fetch,
      }),
    ).rejects.toThrow(/health response is too large/);

    expect(readCount).toBe(2);
    expect(cancelled).toBe(true);
    expect(released).toBe(true);
    expect(arrayBufferCalled).toBe(false);
  });

  it("does not retain fragmented chunks for a second concatenation allocation", async () => {
    const payload = new TextEncoder().encode(
      JSON.stringify({ status: "ok", service: "contextual-orchestrator" }),
    );
    let offset = 0;
    let released = false;
    const reader = {
      async read() {
        if (offset >= payload.length) return { done: true, value: undefined };
        const value = payload.slice(offset, offset + 1);
        offset += 1;
        return { done: false, value };
      },
      async cancel() {},
      releaseLock() {
        released = true;
      },
    };
    const response = {
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: { getReader: () => reader },
      async arrayBuffer() {
        throw new Error("streaming response must not fall back to arrayBuffer");
      },
    } as unknown as Response;
    const concatSpy = vi.spyOn(Buffer, "concat");

    try {
      await expect(
        verifyOrchestratorHealthz("https://orchestrator.example/healthz", {
          fetchImpl: (async () => response) as typeof fetch,
        }),
      ).resolves.toEqual({ status: "ok", service: "contextual-orchestrator" });
      expect(concatSpy).not.toHaveBeenCalled();
      expect(released).toBe(true);
    } finally {
      concatSpy.mockRestore();
    }
  });
});
