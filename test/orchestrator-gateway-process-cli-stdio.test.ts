import { describe, expect, it } from "vitest";

import { createVerifyOrchestratorGatewayProcessCli } from "../scripts/verify-orchestrator-gateway.mjs";

describe("contextual-orchestrator process CLI stdio boundary", () => {
  it("routes expected negative diagnostics through injected writers", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const cli = createVerifyOrchestratorGatewayProcessCli({
      argv: ["node", "verify-orchestrator-gateway.mjs"],
      env: {},
      fetchImpl: async () => new Response(
        JSON.stringify({ status: "ok", service: "contextual-orchestrator" }),
        { status: 200 },
      ),
      writeStdout: (message: string) => {
        stdout.push(message);
      },
      writeStderr: (message: string) => {
        stderr.push(message);
      },
    } as unknown as Parameters<typeof createVerifyOrchestratorGatewayProcessCli>[0]);

    expect(await cli()).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr.join("")).toMatch(
      /Noema contextual-orchestrator preflight failed: NOEMA_LLM_API_URL/,
    );
  });
});
