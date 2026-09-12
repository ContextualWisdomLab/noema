import { describe, expect, it, vi } from "vitest";

import { verifyOrchestratorHealthz } from "../scripts/lib/orchestrator-gateway.mjs";

/**
 * Bound hostile cleanup promises so cancellation-liveness regressions fail deterministically.
 *
 * @param promise Operation whose completion must not depend on cleanup.
 * @param timeoutMs Failsafe interval for the hostile test.
 * @returns Operation result or the sentinel proving it exceeded the test bound.
 */
async function settleWithin<T>(promise: Promise<T>, timeoutMs = 100): Promise<T | "failsafe"> {
  return Promise.race([
    promise,
    new Promise<"failsafe">((resolve) => {
      setTimeout(() => resolve("failsafe"), timeoutMs);
    }),
  ]);
}

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

  it("does not let stalled reader cancellation delay an already-decided oversize rejection", async () => {
    let cancellationStarted = false;
    let released = false;
    const reader = {
      async read() {
        return { done: false, value: new Uint8Array(65_537) };
      },
      cancel() {
        cancellationStarted = true;
        return new Promise<void>(() => {});
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

    const outcome = await settleWithin(
      verifyOrchestratorHealthz("https://orchestrator.example/healthz", {
        fetchImpl: (async () => response) as typeof fetch,
      }).then(
        () => "resolved" as const,
        (error: unknown) => error,
      ),
    );

    expect(outcome).not.toBe("failsafe");
    expect(outcome).toBeInstanceOf(Error);
    expect((outcome as Error).message).toMatch(/health response is too large/);
    expect(cancellationStarted).toBe(true);
    expect(released).toBe(true);
  });

  it("keeps the oversize failure and releases the reader when cancellation throws synchronously", async () => {
    let released = false;
    const reader = {
      async read() {
        return { done: false, value: new Uint8Array(65_537) };
      },
      cancel() {
        throw new Error("cleanup transport failed");
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
        fetchImpl: (async () => response) as typeof fetch,
      }),
    ).rejects.toThrow(/health response is too large/);
    expect(released).toBe(true);
  });

  it("does not let stalled response-body cancellation delay content-length rejection", async () => {
    let cancellationStarted = false;
    const response = {
      ok: true,
      status: 200,
      headers: { get: () => "65537" },
      body: {
        cancel() {
          cancellationStarted = true;
          return new Promise<void>(() => {});
        },
      },
    } as unknown as Response;

    const outcome = await settleWithin(
      verifyOrchestratorHealthz("https://orchestrator.example/healthz", {
        fetchImpl: (async () => response) as typeof fetch,
      }).then(
        () => "resolved" as const,
        (error: unknown) => error,
      ),
    );

    expect(outcome).not.toBe("failsafe");
    expect(outcome).toBeInstanceOf(Error);
    expect((outcome as Error).message).toMatch(/health response is too large/);
    expect(cancellationStarted).toBe(true);
  });

  it("keeps the content-length oversize failure when response cancellation throws synchronously", async () => {
    const response = {
      ok: true,
      status: 200,
      headers: { get: () => "65537" },
      body: {
        cancel() {
          throw new Error("cleanup transport failed");
        },
      },
    } as unknown as Response;

    await expect(
      verifyOrchestratorHealthz("https://orchestrator.example/healthz", {
        fetchImpl: (async () => response) as typeof fetch,
      }),
    ).rejects.toThrow(/health response is too large/);
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
