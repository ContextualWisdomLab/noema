import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { verifyOrchestratorGatewayContract } from "../scripts/lib/orchestrator-gateway.mjs";
import {
  createVerifyOrchestratorGatewayProcessCli,
  runVerifyOrchestratorGatewayCli,
} from "../scripts/verify-orchestrator-gateway.mjs";

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
    NOEMA_LLM_API_KEY: "must-never-be-read-by-preflight",
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

function workflowStep(workflow: string, name: string, nextName: string): string {
  const start = workflow.indexOf(`      - name: ${name}`);
  const end = workflow.indexOf(`      - name: ${nextName}`, start + 1);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return workflow.slice(start, end);
}

describe("contextual-orchestrator secret-source policy", () => {
  it("keeps the injectable preflight secret-free while validating gateway identity", async () => {
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

  it("keeps the reusable gateway verifier secret-free", async () => {
    await expect(verifyOrchestratorGatewayContract({
      env: envWithoutSecretAccess(),
      fetchImpl: async () => healthyResponse(),
    })).resolves.toEqual({
      apiUrl: "https://orchestrator.example/v1",
      model: "contextual-orchestrator",
      healthzUrl: "https://orchestrator.example/healthz",
    });
  });

  it("filters the real process adapter down to non-secret preflight settings", async () => {
    const cli = createVerifyOrchestratorGatewayProcessCli({
      argv: [process.execPath, "scripts/verify-orchestrator-gateway.mjs"],
      env: envWithoutSecretAccess(),
      fetchImpl: async () => healthyResponse(),
    });

    await expect(cli()).resolves.toBe(0);
  });

  it("materializes the inference secret only for the credential-consuming OpenCode step", () => {
    const workflow = readFileSync(
      ".github/workflows/hourly-product-development.yml",
      "utf8",
    );
    const preflight = workflowStep(
      workflow,
      "Verify contextual-orchestrator gateway and write OpenCode config",
      "Install checksum-pinned OpenCode CLI",
    );
    const openCode = workflowStep(
      workflow,
      "Run one contextual-orchestrator OpenCode session",
      "Bound and export proposal without executing it",
    );

    expect(preflight).toContain("NOEMA_LLM_API_URL");
    expect(preflight).toContain("NOEMA_LLM_MODEL");
    expect(preflight).not.toContain("NOEMA_LLM_API_KEY");
    expect(openCode).toContain(
      "NOEMA_LLM_API_KEY: ${{ secrets.NOEMA_LLM_API_KEY }}",
    );
  });
});
