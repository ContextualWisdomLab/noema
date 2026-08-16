import { describe, expect, it } from "vitest";

import { verifyOrchestratorHealthz } from "../scripts/lib/orchestrator-gateway.mjs";

describe("contextual-orchestrator bounded health response", () => {
  it("rejects an advertised oversized body before materializing it", async () => {
    let materialized = false;
    const response = {
      ok: true,
      status: 200,
      headers: {
        get(name: string) {
          return name.toLowerCase() === "content-length" ? "65537" : null;
        },
      },
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
});
