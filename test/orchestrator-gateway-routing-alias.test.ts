import { describe, expect, it } from "vitest";

import { resolveOrchestratorModel } from "../scripts/lib/orchestrator-gateway.mjs";
import { runVerifyOrchestratorGatewayCli } from "../scripts/verify-orchestrator-gateway.mjs";

describe("contextual-orchestrator routing alias authority", () => {
  it("rejects a configurable model override before network access", async () => {
    let fetchCalled = false;
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runVerifyOrchestratorGatewayCli({
      argv: [],
      env: {
        NOEMA_LLM_API_URL: "https://orchestrator.example/v1",
        NOEMA_LLM_API_KEY: "gateway-token",
        NOEMA_LLM_MODEL: "gpt-5",
      },
      fetchImpl: async () => {
        fetchCalled = true;
        return new Response(
          JSON.stringify({ status: "ok", service: "contextual-orchestrator" }),
          { status: 200 },
        );
      },
      writeStdout: (message) => stdout.push(message),
      writeStderr: (message) => stderr.push(message),
    });

    expect(exitCode).toBe(1);
    expect(fetchCalled).toBe(false);
    expect(stdout.join("")).toBe("");
    expect(stderr.join("")).toMatch(
      /NOEMA_LLM_MODEL must equal orchestrator\/free/,
    );
  });

  it("rejects a non-canonical alias at the shared library boundary", () => {
    expect(() => resolveOrchestratorModel("gpt-5")).toThrow(
      /NOEMA_LLM_MODEL must equal orchestrator\/free/,
    );
  });

  it("normalizes the legacy configured service alias before gateway use", async () => {
    let fetchCalled = false;
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runVerifyOrchestratorGatewayCli({
      argv: [],
      env: {
        NOEMA_LLM_API_URL: "https://orchestrator.example/v1",
        NOEMA_LLM_MODEL: "contextual-orchestrator",
      },
      fetchImpl: async () => {
        fetchCalled = true;
        return new Response(
          JSON.stringify({ status: "ok", service: "contextual-orchestrator" }),
          { status: 200 },
        );
      },
      writeStdout: (message) => stdout.push(message),
      writeStderr: (message) => stderr.push(message),
    });

    expect(exitCode).toBe(0);
    expect(fetchCalled).toBe(true);
    expect(stderr).toEqual([]);
    expect(stdout.join("")).toContain("primary=orchestrator/free");
  });
});
