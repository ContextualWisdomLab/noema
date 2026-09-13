import { describe, expect, it } from "vitest";

import { verifyOrchestratorHealthz } from "../scripts/lib/orchestrator-gateway.mjs";

function jsonHeaders(contentLength: string | null = null) {
  return {
    get(name: string) {
      if (name.toLowerCase() === "content-type") return "application/json";
      if (name.toLowerCase() === "content-length") return contentLength;
      return null;
    },
  };
}

describe("contextual-orchestrator bounded health response", () => {
  it("rejects an advertised oversized body before materializing it", async () => {
    let materialized = false;
    const response = {
      ok: true,
      status: 200,
      headers: jsonHeaders("65537"),
      async arrayBuffer() {
        materialized = true;
        return new Uint8Array(65_537).buffer;
      },
    } as unknown as Response;

    await expect(
      verifyOrchestratorHealthz("https://orchestrator.example/healthz", {
        fetchImpl: (async () => response) as typeof fetch,
      }),
    ).rejects.toThrow(/health response is too large/);
    expect(materialized).toBe(false);
  });

  it("rejects an oversized non-streaming body after bounded materialization", async () => {
    let materialized = 0;
    const response = {
      ok: true,
      status: 200,
      headers: jsonHeaders(),
      async arrayBuffer() {
        materialized += 1;
        return new Uint8Array(65_537).buffer;
      },
    } as unknown as Response;

    await expect(
      verifyOrchestratorHealthz("https://orchestrator.example/healthz", {
        fetchImpl: (async () => response) as typeof fetch,
      }),
    ).rejects.toThrow(/health response is too large/);
    expect(materialized).toBe(1);
  });

  it("fails closed when the transport rejects with a non-Error value", async () => {
    await expect(
      verifyOrchestratorHealthz("https://orchestrator.example/healthz", {
        fetchImpl: (async () => Promise.reject(null)) as typeof fetch,
      }),
    ).rejects.toThrow(/contextual-orchestrator health request failed: null/);
  });
});
