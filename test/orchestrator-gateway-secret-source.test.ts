import { describe, expect, it } from "vitest";

import { verifyOrchestratorGatewayContract } from "../scripts/lib/orchestrator-gateway.mjs";
import { runVerifyOrchestratorGatewayCli } from "../scripts/verify-orchestrator-gateway.mjs";

function healthyResponse(): Response {
  return new Response(
    JSON.stringify({ status: "ok", service: "contextual-orchestrator" }),
    { status: 200 },
  );
}

function envWithoutSecretAccess(): NodeJS.ProcessEnv {
  const source: NodeJS.ProcessEnv = {
    NOEMA_LLM_API_URL: "https://orchestrator.example/v1",
    NOEMA_LLM_MODEL: "contextual-orchestrator",
  };
  return new Proxy(source, {
    get(target, property, receiver) {
      if (property === "NOEMA_LLM_API_KEY") {
        throw new Error("gateway preflight must not read the raw LLM secret environment variable");
      }
      return Reflect.get(target, property, receiver);
    },
  });
}

describe("contextual-orchestrator secret-source policy", () => {
  it("verifies the gateway without reading the raw LLM secret environment variable", async () => {
    const verified = await verifyOrchestratorGatewayContract({
      env: envWithoutSecretAccess(),
      fetchImpl: async () => healthyResponse(),
    });

    expect(verified).toEqual({
      apiUrl: "https://orchestrator.example/v1",
      model: "contextual-orchestrator",
      healthzUrl: "https://orchestrator.example/healthz",
    });
  });

  it("keeps the executable preflight secret-free while validating gateway identity", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const exitCode = await runVerifyOrchestratorGatewayCli({
      argv: [],
      env: envWithoutSecretAccess(),
      fetchImpl: async () => healthyResponse(),
      writeStdout: (message) => stdout.push(message),
      writeStderr: (message) => stderr.push(message),
    });

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout.join(""))
      .toContain("Verified contextual-orchestrator gateway identity.");
  });
});
