import { describe, expect, it, vi } from "vitest";

import { createWorkflowRegistryGithubJsonReader } from "../scripts/workflow-registry-live-disable.mjs";

const endpoint = "repos/ContextualWisdomLab/noema/actions/workflows?per_page=100&page=1";
const timeoutReason = () => new DOMException("deadline", "TimeoutError");

describe("workflow registry deadline cleanup coverage", () => {
  it("keeps a rejected async cancellation from replacing the bounded size failure", async () => {
    const chunk = new Uint8Array(1024 * 1024).fill(0x20);
    let asyncCleanupObserved = false;
    const response = {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      body: {
        getReader() {
          return {
            read: async () => ({ done: false, value: chunk }),
            cancel() {
              return Promise.reject(new Error("cleanup failure")).catch((error) => {
                asyncCleanupObserved = error instanceof Error;
                throw error;
              });
            },
          };
        },
      },
    } as unknown as Response;
    const ghJson = createWorkflowRegistryGithubJsonReader({
      token: "test-token",
      fetchImpl: async () => response,
    });

    await expect(ghJson(endpoint)).rejects.toThrow(
      "workflow registry GitHub response exceeds the bounded size limit",
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(asyncCleanupObserved).toBe(true);
  });

  it("rejects an unstreamable body without invoking arrayBuffer fallback", async () => {
    const arrayBuffer = vi.fn(async () => new TextEncoder().encode('{"total_count":0,"workflows":[]}').buffer);
    const response = {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      body: null,
      arrayBuffer,
    } as unknown as Response;
    const ghJson = createWorkflowRegistryGithubJsonReader({
      token: "test-token",
      fetchImpl: async () => response,
    });

    await expect(ghJson(endpoint)).rejects.toThrow("response body is not stream-readable");
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it("propagates a non-timeout response-stream read failure without timeout reclassification", async () => {
    const response = {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      body: {
        getReader() {
          return {
            read: async () => {
              throw new Error("upstream body read failed");
            },
            cancel: vi.fn(),
          };
        },
      },
    } as unknown as Response;
    const ghJson = createWorkflowRegistryGithubJsonReader({
      token: "test-token",
      fetchImpl: async () => response,
    });

    await expect(ghJson(endpoint)).rejects.toThrow("upstream body read failed");
  });

  it("classifies a synchronous transport failure that coincides with deadline expiry", async () => {
    const timeoutController = new AbortController();
    const reason = timeoutReason();
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout").mockReturnValue(timeoutController.signal);
    try {
      const ghJson = createWorkflowRegistryGithubJsonReader({
        token: "test-token",
        fetchImpl: (() => {
          timeoutController.abort(reason);
          throw reason;
        }) as typeof fetch,
      });

      await expect(ghJson(endpoint)).rejects.toThrow("workflow registry GitHub request timed out");
    } finally {
      timeoutSpy.mockRestore();
    }
  });

  it("does not require a cancelable body when a late response arrives after the deadline", async () => {
    const timeoutController = new AbortController();
    const reason = timeoutReason();
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout").mockReturnValue(timeoutController.signal);
    let resolveTransport: ((response: Response) => void) | undefined;
    const transport = new Promise<Response>((resolve) => {
      resolveTransport = resolve;
    });
    try {
      const ghJson = createWorkflowRegistryGithubJsonReader({
        token: "test-token",
        fetchImpl: async () => transport,
      });
      const outcome = ghJson(endpoint).then(
        () => "resolved",
        (error: unknown) => error instanceof Error ? error.message : String(error),
      );

      await Promise.resolve();
      timeoutController.abort(reason);
      await expect(outcome).resolves.toBe("workflow registry GitHub request timed out");
      resolveTransport?.(new Response(null, {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
      await Promise.resolve();
      await Promise.resolve();
    } finally {
      timeoutSpy.mockRestore();
    }
  });
});
