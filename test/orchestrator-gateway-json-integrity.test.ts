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

  it("rejects a valid identity document served under a non-JSON media type", async () => {
    const response = new Response(
      JSON.stringify({ status: "ok", service: "contextual-orchestrator" }),
      {
        status: 200,
        headers: { "content-type": "text/plain; charset=utf-8" },
      },
    );

    await expect(
      verifyOrchestratorHealthz("https://orchestrator.example/healthz", {
        fetchImpl: (async () => response) as typeof fetch,
      }),
    ).rejects.toThrow(
      "contextual-orchestrator health response content-type is not application/json",
    );
  });

  it("rejects a health identity when the media type is missing", async () => {
    const body = JSON.stringify({
      status: "ok",
      service: "contextual-orchestrator",
    });
    const response = {
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: null,
      arrayBuffer: async () => new TextEncoder().encode(body).buffer,
    } as unknown as Response;

    await expect(
      verifyOrchestratorHealthz("https://orchestrator.example/healthz", {
        fetchImpl: (async () => response) as typeof fetch,
      }),
    ).rejects.toThrow(
      "contextual-orchestrator health response content-type is not application/json",
    );
  });

  it("accepts application/json with media-type parameters", async () => {
    const response = new Response(
      JSON.stringify({ status: "ok", service: "contextual-orchestrator" }),
      {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      },
    );

    await expect(
      verifyOrchestratorHealthz("https://orchestrator.example/healthz", {
        fetchImpl: (async () => response) as typeof fetch,
      }),
    ).resolves.toEqual({ status: "ok", service: "contextual-orchestrator" });
  });
});
