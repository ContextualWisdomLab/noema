import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  boundedGatewayError,
  buildOpenCodeOrchestratorConfig,
  defaultOrchestratorModel,
  directProviderHosts,
  parseOrchestratorGatewayUrl,
  readGatewayTransportValue,
  requireOrchestratorApiKey,
  resolveOrchestratorModel,
  verifyOrchestratorGatewayContract,
  verifyOrchestratorHealthz,
  writeOpenCodeOrchestratorConfig,
} from "../scripts/lib/orchestrator-gateway.mjs";
import {
  parseVerifyOrchestratorGatewayArgs,
  runVerifyOrchestratorGatewayCli,
  runVerifyOrchestratorGatewayEntrypoint,
} from "../scripts/verify-orchestrator-gateway.mjs";

const temporaryDirectories: string[] = [];

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

function tempDir(): string {
  const directory = mkdtempSync(join(tmpdir(), "noema-orchestrator-gateway-"));
  temporaryDirectories.push(directory);
  return directory;
}

describe("contextual-orchestrator gateway contract", () => {
  it("accepts an HTTPS /v1 URL and derives /healthz", () => {
    const parsed = parseOrchestratorGatewayUrl(
      "https://orchestrator.example/inference/v1",
    );
    expect(parsed.href).toBe("https://orchestrator.example/inference/v1");
    expect(parsed.healthzUrl).toBe("https://orchestrator.example/inference/healthz");
    expect(defaultOrchestratorModel()).toBe("contextual-orchestrator");
  });

  it("rejects direct provider hosts, credentials, and non-/v1 paths", () => {
    for (const host of directProviderHosts()) {
      expect(() => parseOrchestratorGatewayUrl(`https://${host}/v1`)).toThrow(
        /contextual-orchestrator, not a direct model provider/,
      );
    }
    expect(() => parseOrchestratorGatewayUrl("http://orchestrator.example/v1"))
      .toThrow(/absolute HTTPS URL/);
    expect(() => parseOrchestratorGatewayUrl("https://user:pass@orchestrator.example/v1"))
      .toThrow(/must not contain credentials, query, or fragment/);
    expect(() => parseOrchestratorGatewayUrl("https://orchestrator.example/v1?x=1"))
      .toThrow(/must not contain credentials, query, or fragment/);
    expect(() => parseOrchestratorGatewayUrl("https://orchestrator.example/v2"))
      .toThrow(/must end in \/v1/);
    expect(() => parseOrchestratorGatewayUrl("https://orchestrator.example/v1#frag"))
      .toThrow(/must not contain credentials, query, or fragment/);
    expect(() => parseOrchestratorGatewayUrl("not-a-url")).toThrow(/absolute HTTPS URL/);
    expect(readGatewayTransportValue({ NOEMA_LLM_API_KEY: undefined }, "NOEMA_LLM_API_KEY"))
      .toBe("");
    expect(readGatewayTransportValue(
      { NOEMA_LLM_API_KEY: 1 } as NodeJS.ProcessEnv,
      "NOEMA_LLM_API_KEY",
    )).toBe("");
    expect(boundedGatewayError(new Error("Bearer sk-secretvalue123456"))).toContain("[REDACTED]");
    expect(boundedGatewayError("plain")).toBe("plain");
  });

  it("accepts one routing alias and rejects sequential candidate lists", () => {
    expect(resolveOrchestratorModel("")).toBe("contextual-orchestrator");
    expect(resolveOrchestratorModel("contextual-orchestrator"))
      .toBe("contextual-orchestrator");
    expect(() => resolveOrchestratorModel("alpha beta")).toThrow(/one routing alias/);
    expect(() => resolveOrchestratorModel("alpha,beta")).toThrow(/one routing alias/);
    expect(() => resolveOrchestratorModel("nvidia-nim/nvidia/llama")).toThrow(
      /not a direct provider model/,
    );
    expect(() => resolveOrchestratorModel("openai/gpt-4.1")).toThrow(
      /not a direct provider model/,
    );
    expect(() => resolveOrchestratorModel("github-models/openai/gpt-4.1")).toThrow(
      /not a direct provider model/,
    );
    expect(() => requireOrchestratorApiKey("")).toThrow(/NOEMA_LLM_API_KEY is not configured/);
  });

  it("writes a single-provider OpenCode config that never embeds the API key", () => {
    const config = buildOpenCodeOrchestratorConfig({
      apiUrl: "https://orchestrator.example/v1",
      model: "contextual-orchestrator",
    });
    const serialized = JSON.stringify(config);
    expect(config.enabled_providers).toEqual(["contextual-orchestrator"]);
    expect(config.model).toBe("contextual-orchestrator/contextual-orchestrator");
    expect(config.small_model).toBe("contextual-orchestrator/contextual-orchestrator");
    expect(config.provider["contextual-orchestrator"].options.baseURL)
      .toBe("https://orchestrator.example/v1");
    expect(config.provider["contextual-orchestrator"].options.apiKey)
      .toBe("{env:NOEMA_LLM_API_KEY}");
    expect(Object.keys(config.provider["contextual-orchestrator"].models)).toEqual([
      "contextual-orchestrator",
    ]);
    expect(serialized).not.toContain("nvidia-nim");
    expect(serialized).not.toContain("integrate.api.nvidia.com");
    expect(serialized).not.toContain("NVIDIA_API_KEY");
    expect(serialized).not.toContain("sk-");

    const output = join(tempDir(), "opencode.json");
    writeOpenCodeOrchestratorConfig(output, {
      apiUrl: "https://orchestrator.example/v1",
      model: "contextual-orchestrator",
    });
    expect(readFileSync(output, "utf8")).toContain("contextual-orchestrator");
  });

  it("verifies /healthz identity through an injectable fetch and fails closed otherwise", async () => {
    const healthy = await verifyOrchestratorGatewayContract({
      env: {
        NOEMA_LLM_API_URL: "https://orchestrator.example/v1",
        NOEMA_LLM_API_KEY: "gateway-token",
        NOEMA_LLM_MODEL: "contextual-orchestrator",
      },
      fetchImpl: async () => new Response(
        JSON.stringify({ status: "ok", service: "contextual-orchestrator" }),
        { status: 200 },
      ),
    });
    expect(healthy.healthzUrl).toBe("https://orchestrator.example/healthz");

    await expect(verifyOrchestratorGatewayContract({
      env: {
        NOEMA_LLM_API_URL: "https://orchestrator.example/v1",
        NOEMA_LLM_API_KEY: "gateway-token",
      },
      fetchImpl: async () => new Response(
        JSON.stringify({ status: "ok", service: "openai" }),
        { status: 200 },
      ),
    })).rejects.toThrow(/did not identify contextual-orchestrator/);

    await expect(verifyOrchestratorGatewayContract({
      env: {
        NOEMA_LLM_API_URL: "https://api.openai.com/v1",
        NOEMA_LLM_API_KEY: "must-not-appear",
      },
      fetchImpl: async () => {
        throw new Error("fetch must not run for a direct provider");
      },
    })).rejects.toThrow(/not a direct model provider/);

    const written = join(tempDir(), "from-verify.json");
    const verifiedWrite = await verifyOrchestratorGatewayContract({
      env: {
        NOEMA_LLM_API_URL: "https://orchestrator.example/v1/",
        NOEMA_LLM_API_KEY: "gateway-token",
      },
      fetchImpl: async () => new Response(
        JSON.stringify({ status: "ok", service: "contextual-orchestrator" }),
        { status: 200 },
      ),
      openCodeConfigPath: written,
    });
    expect(verifiedWrite.model).toBe("contextual-orchestrator");
    expect(readFileSync(written, "utf8")).toContain('"enabled_providers"');

    await expect(verifyOrchestratorHealthz("https://orchestrator.example/healthz", {
      fetchImpl: async () => {
        throw new Error("network down");
      },
    })).rejects.toThrow(/health request failed/);
    await expect(verifyOrchestratorHealthz("https://orchestrator.example/healthz", {
      fetchImpl: async () => new Response("nope", { status: 503 }),
    })).rejects.toThrow(/status is 503/);
    await expect(verifyOrchestratorHealthz("https://orchestrator.example/healthz", {
      fetchImpl: async () => new Response("{", { status: 200 }),
    })).rejects.toThrow(/is not JSON/);
    await expect(verifyOrchestratorHealthz("https://orchestrator.example/healthz", {
      fetchImpl: async () => new Response("x".repeat(65_537), { status: 200 }),
    })).rejects.toThrow(/too large/);
    await expect(verifyOrchestratorHealthz("https://orchestrator.example/healthz", {
      fetchImpl: "not-a-function" as unknown as typeof fetch,
    })).rejects.toThrow(/requires fetch/);
    await expect(verifyOrchestratorHealthz("https://orchestrator.example/healthz", {
      timeoutMs: 10,
      fetchImpl: () => new Promise(() => {}),
    })).rejects.toThrow(/health request failed/);
  });

  it("keeps the CLI fail-closed and never prints the gateway token", async () => {
    const output = join(tempDir(), "opencode.json");
    const stdout: string[] = [];
    const stderr: string[] = [];
    expect(parseVerifyOrchestratorGatewayArgs([
      "--write-opencode-config",
      output,
    ]).openCodeConfigPath).toBe(output);

    const missingKey = await runVerifyOrchestratorGatewayCli({
      argv: [],
      env: {
        NOEMA_LLM_API_URL: "https://orchestrator.example/v1",
        NOEMA_LLM_API_KEY: "",
      },
      writeStdout: (message) => {
        stdout.push(message);
      },
      writeStderr: (message) => {
        stderr.push(message);
      },
    });
    expect(missingKey).toBe(1);
    expect(stderr.join("")).toMatch(/NOEMA_LLM_API_KEY is not configured/);

    const directProvider = await runVerifyOrchestratorGatewayCli({
      argv: [],
      env: {
        NOEMA_LLM_API_URL: "https://integrate.api.nvidia.com/v1",
        NOEMA_LLM_API_KEY: "gateway-token",
      },
      writeStdout: (message) => {
        stdout.push(message);
      },
      writeStderr: (message) => {
        stderr.push(message);
      },
    });
    expect(directProvider).toBe(1);
    expect(stderr.join("")).toMatch(/not a direct model provider/);
    expect(stdout.join("")).not.toContain("gateway-token");
    expect(stderr.join("")).not.toContain("gateway-token");
  });

  it("keeps unknown CLI flags fail-closed", () => {
    expect(() => parseVerifyOrchestratorGatewayArgs(["--fallback-model"]))
      .toThrow(/Unknown argument/);
    expect(() => parseVerifyOrchestratorGatewayArgs(["--write-opencode-config"]))
      .toThrow(/requires a destination path/);
  });

  it("prints the gateway identity after a successful CLI preflight", async () => {
    const output = join(tempDir(), "cli-opencode.json");
    const stdout: string[] = [];
    const status = await runVerifyOrchestratorGatewayCli({
      argv: ["--write-opencode-config", output],
      env: {
        NOEMA_LLM_API_URL: "https://orchestrator.example/v1",
        NOEMA_LLM_API_KEY: "gateway-token",
        NOEMA_LLM_MODEL: "contextual-orchestrator",
      },
      fetchImpl: async () => new Response(
        JSON.stringify({ status: "ok", service: "contextual-orchestrator" }),
        { status: 200 },
      ),
      writeStdout: (message) => {
        stdout.push(message);
      },
      writeStderr: () => {},
    });
    expect(status).toBe(0);
    expect(stdout.join("")).toContain("Verified contextual-orchestrator gateway identity.");
    expect(stdout.join("")).toContain("primary=contextual-orchestrator");
    expect(readFileSync(output, "utf8")).toContain("contextual-orchestrator");

    const nonErrorStatus = await runVerifyOrchestratorGatewayCli({
      argv: [],
      env: {
        NOEMA_LLM_API_URL: "https://orchestrator.example/v1",
        NOEMA_LLM_API_KEY: "gateway-token",
      },
      fetchImpl: async () => {
        throw "boom";
      },
      writeStdout: () => {},
      writeStderr: () => {},
    });
    expect(nonErrorStatus).toBe(1);

    let ran = false;
    await runVerifyOrchestratorGatewayEntrypoint(false, async () => {
      ran = true;
      return 0;
    });
    expect(ran).toBe(false);
    const previousExit = process.exitCode;
    await runVerifyOrchestratorGatewayEntrypoint(true, async () => 0);
    expect(process.exitCode).toBe(0);
    process.exitCode = previousExit;
  });
});
