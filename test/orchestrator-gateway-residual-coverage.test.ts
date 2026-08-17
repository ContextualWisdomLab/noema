import { describe, expect, it } from "vitest";
import {
  requireOrchestratorApiKey,
  verifyOrchestratorHealthz,
} from "../scripts/lib/orchestrator-gateway.mjs";

const healthyPayload = JSON.stringify({
  status: "ok",
  service: "contextual-orchestrator",
});

function responseLike(input: {
  contentLength?: string | null;
  body?: unknown;
  arrayBuffer?: () => Promise<ArrayBuffer>;
}): Response {
  return {
    ok: true,
    status: 200,
    headers: {
      get: () => input.contentLength ?? null,
    },
    body: input.body ?? null,
    arrayBuffer: input.arrayBuffer ?? (async () => new TextEncoder().encode(healthyPayload).buffer),
  } as unknown as Response;
}

describe("contextual-orchestrator residual health coverage", () => {
  it("accepts a configured dedicated orchestrator API key", () => {
    expect(requireOrchestratorApiKey(" dedicated-orchestrator-key ")).toBeUndefined();
  });

  it("ignores a malformed Content-Length and validates the bounded stream", async () => {
    const response = new Response(healthyPayload, {
      status: 200,
      headers: {
        "content-length": "not-a-decimal-length",
      },
    });

    const health = await verifyOrchestratorHealthz(
      "https://orchestrator.example/healthz",
      {
        fetchImpl: async () => response,
      },
    );

    expect(health.service).toBe("contextual-orchestrator");
  });

  it("uses the bounded arrayBuffer fallback when streaming is unavailable", async () => {
    const bytes = new TextEncoder().encode(healthyPayload);
    const response = responseLike({
      body: null,
      arrayBuffer: async () => bytes.buffer,
    });

    const health = await verifyOrchestratorHealthz(
      "https://orchestrator.example/healthz",
      {
        fetchImpl: async () => response,
      },
    );

    expect(health.status).toBe("ok");
  });

  it("treats an undefined streaming chunk as empty before reading the payload", async () => {
    const payload = new TextEncoder().encode(healthyPayload);
    let readCount = 0;
    const response = responseLike({
      body: {
        getReader: () => ({
          read: async () => {
            readCount += 1;
            if (readCount === 1) return { done: false, value: undefined };
            if (readCount === 2) return { done: false, value: payload };
            return { done: true, value: undefined };
          },
          cancel: async () => undefined,
          releaseLock: () => undefined,
        }),
      },
    });

    const health = await verifyOrchestratorHealthz(
      "https://orchestrator.example/healthz",
      {
        fetchImpl: async () => response,
      },
    );

    expect(health.service).toBe("contextual-orchestrator");
  });

  it("preserves the oversized-body failure when stream cancellation also fails", async () => {
    let releaseCalled = false;
    const response = responseLike({
      body: {
        getReader: () => ({
          read: async () => ({
            done: false,
            value: new Uint8Array(65_537),
          }),
          cancel: async () => {
            throw new Error("cancel failed");
          },
          releaseLock: () => {
            releaseCalled = true;
          },
        }),
      },
    });

    await expect(verifyOrchestratorHealthz(
      "https://orchestrator.example/healthz",
      {
        fetchImpl: async () => response,
      },
    )).rejects.toThrow(/too large/);
    expect(releaseCalled).toBe(true);
  });

  it("preserves the advertised-size rejection when body cancellation rejects", async () => {
    let cancelCalled = false;
    const response = responseLike({
      contentLength: "65537",
      body: {
        cancel: async () => {
          cancelCalled = true;
          throw new Error("cancel failed");
        },
      },
    });

    await expect(verifyOrchestratorHealthz(
      "https://orchestrator.example/healthz",
      {
        fetchImpl: async () => response,
      },
    )).rejects.toThrow(/too large/);
    expect(cancelCalled).toBe(true);
  });
});
