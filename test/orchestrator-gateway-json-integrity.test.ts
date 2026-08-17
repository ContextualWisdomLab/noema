import { describe, expect, it } from "vitest";

import { verifyOrchestratorHealthz } from "../scripts/lib/orchestrator-gateway.mjs";

function healthResponse(body: Uint8Array | string): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("contextual-orchestrator health JSON integrity", () => {
  it("rejects malformed UTF-8 instead of accepting replacement-decoded metadata", async () => {
    const prefix = Buffer.from(
      '{"status":"ok","service":"contextual-orchestrator","note":"',
      "utf8",
    );
    const suffix = Buffer.from('"}', "utf8");
    const body = Buffer.concat([prefix, Buffer.from([0xc3, 0x28]), suffix]);

    await expect(
      verifyOrchestratorHealthz("https://orchestrator.example/healthz", {
        fetchImpl: (async () => healthResponse(body)) as typeof fetch,
      }),
    ).rejects.toThrow(/valid UTF-8/);
  });

  it("rejects duplicate decoded identity keys instead of accepting last-key-wins JSON", async () => {
    const body = '{"status":"degraded","st\\u0061tus":"ok","service":"contextual-orchestrator"}';

    await expect(
      verifyOrchestratorHealthz("https://orchestrator.example/healthz", {
        fetchImpl: (async () => healthResponse(body)) as typeof fetch,
      }),
    ).rejects.toThrow(/duplicate decoded JSON keys/);
  });
});
