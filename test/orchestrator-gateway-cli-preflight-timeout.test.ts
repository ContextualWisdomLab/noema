import { afterEach, describe, expect, it, vi } from "vitest";

import { runVerifyOrchestratorGatewayCli } from "../scripts/verify-orchestrator-gateway.mjs";

afterEach(() => {
  vi.useRealTimers();
});

describe("contextual-orchestrator CLI health preflight", () => {
  it("bounds the transport-only health preflight without imposing a model inference deadline", async () => {
    vi.useFakeTimers();
    let observedSignal: AbortSignal | undefined;
    const stderr: string[] = [];

    const result = runVerifyOrchestratorGatewayCli({
      argv: [],
      env: {
        NOEMA_LLM_API_URL: "https://orchestrator.example/v1",
        NOEMA_LLM_MODEL: "orchestrator/free",
      },
      fetchImpl: ((_: unknown, init?: RequestInit) => {
        observedSignal = init?.signal as AbortSignal | undefined;
        return new Promise<Response>(() => undefined);
      }) as typeof fetch,
      writeStdout: () => undefined,
      writeStderr: (message) => {
        stderr.push(message);
      },
    });

    await vi.advanceTimersByTimeAsync(15_001);

    expect(observedSignal?.aborted).toBe(true);
    await expect(result).resolves.toBe(1);
    expect(stderr.join("")).toMatch(/health request failed: .*timed out/);
  });
});
