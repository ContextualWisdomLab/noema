import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import {
  buildOpenCodeOrchestratorConfig,
  parseOrchestratorGatewayApiUrlAllowlist,
  verifyOrchestratorGatewayContract,
} from "../scripts/lib/orchestrator-gateway.mjs";

const fixture = JSON.parse(
  readFileSync(
    "test/fixtures/orchestrator-gateway-endpoint-allowlist-v2.json",
    "utf8",
  ),
) as { allowed: string[]; rejected: string[] };
const allowlistJson = JSON.stringify(fixture.allowed);

describe("contextual-orchestrator released endpoint admission", () => {
  it("rejects a self-identified arbitrary HTTPS host before health fetch", async () => {
    const fetchImpl = vi.fn(async () => new Response(
      JSON.stringify({ status: "ok", service: "contextual-orchestrator" }),
      { status: 200, headers: { "content-type": "application/json" } },
    ));

    await expect(verifyOrchestratorGatewayContract({
      env: {
        NOEMA_LLM_API_URL: "https://attacker.example/v1",
        NOEMA_LLM_API_URL_ALLOWLIST_JSON: allowlistJson,
      },
      fetchImpl,
    })).rejects.toThrow(/NOEMA_LLM_API_URL is not an allowed released contextual-orchestrator endpoint/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("accepts exact membership without assigning list order routing meaning", async () => {
    const result = await verifyOrchestratorGatewayContract({
      env: {
        NOEMA_LLM_API_URL: fixture.allowed[1],
        NOEMA_LLM_API_URL_ALLOWLIST_JSON: allowlistJson,
      },
      fetchImpl: async () => new Response(
        JSON.stringify({ status: "ok", service: "contextual-orchestrator" }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    });

    expect(result.apiUrl).toBe(fixture.allowed[1]);
  });

  it("does not fall back across allowlist members after selected health failure", async () => {
    const requestedUrls: string[] = [];
    await expect(verifyOrchestratorGatewayContract({
      env: {
        NOEMA_LLM_API_URL: fixture.allowed[1],
        NOEMA_LLM_API_URL_ALLOWLIST_JSON: allowlistJson,
      },
      fetchImpl: async (input) => {
        requestedUrls.push(String(input));
        return new Response("unavailable", { status: 503 });
      },
    })).rejects.toThrow(/status is 503/);

    expect(requestedUrls).toEqual([
      "https://orchestrator-b.example/inference/healthz",
    ]);
  });

  it.each([
    "",
    "{}",
    "[]",
    '["https://orchestrator-a.example/v1", 1]',
    '["https://orchestrator-a.example/v1", "https://orchestrator-a.example/v1"]',
    '["https://*.example/v1"]',
    '["https://ORCHESTRATOR-A.example/v1"]',
    '["https://orchestrator-a.example/v1/"]',
    '["https://orchestrator-a.example:443/v1"]',
    '["https://orchestrator-a.example:99999/v1"]',
    '["https://éxample.example/v1"]',
    '[" https://orchestrator-a.example/v1 "]',
    '["https://orchestrator-a.example./v1"]',
    '["http://127.0.0.1:18080/v1"]',
    '["https://127.0.0.2/v1"]',
    '["https://127.1/v1"]',
    '["https://2130706433/v1"]',
    '["https://0x7f000001/v1"]',
    '["https://0177.0.0.1/v1"]',
    '["https://[0:0:0:0:0:0:0:1]/v1"]',
    '["https://localhost/v1"]',
    '["https://[2001:0db8:0:0:0:0:0:1]/v1"]',
    '["https://orchestrator-a.example/./v1"]',
    '["https://orchestrator-a.example/x/../v1"]',
    '["https://api.openai.com/v1"]',
    '["https://%61pi.openai.com/v1"]',
    '["https://api%2eopenai.com/v1"]',
    '["https://[fe80::1%25eth0]/v1"]',
    '["https://orchestrator-a.example/a\\\\b/v1"]',
    '["https://orchestrator-a.example\\\\evil.example/v1"]',
    '["https://foo..example/v1"]',
    `["https://${"a".repeat(64)}.example/v1"]`,
    '["https://[::ffff:192.0.2.1]/v1"]',
    '["https://[::ffff:c000:201]/v1"]',
  ])("rejects malformed or non-authoritative allowlist %j", (raw) => {
    expect(() => parseOrchestratorGatewayApiUrlAllowlist(raw)).toThrow(
      /NOEMA_LLM_API_URL_ALLOWLIST_JSON/,
    );
  });

  it.each([
    { apiUrl: "https://ORCHESTRATOR-A.example/v1", error: /canonical endpoint URL/ },
    { apiUrl: "https://orchestrator-a.example/v1/", error: /canonical endpoint URL/ },
    { apiUrl: "https://orchestrator-a.example:443/v1", error: /canonical endpoint URL/ },
    { apiUrl: "https://éxample.example/v1", error: /canonical endpoint URL/ },
    { apiUrl: " https://orchestrator-a.example/v1 ", error: /canonical endpoint URL/ },
    { apiUrl: "https://orchestrator-a.example./v1", error: /canonical endpoint URL/ },
    { apiUrl: "https://[2001:0db8:0:0:0:0:0:1]/v1", error: /canonical endpoint URL/ },
    { apiUrl: "https://orchestrator-a.example/./v1", error: /canonical endpoint URL/ },
    { apiUrl: "https://orchestrator-a.example/x/../v1", error: /canonical endpoint URL/ },
    { apiUrl: "https://127.1/v1", error: /loopback endpoint/ },
    { apiUrl: "https://2130706433/v1", error: /loopback endpoint/ },
    { apiUrl: "https://0x7f000001/v1", error: /loopback endpoint/ },
    { apiUrl: "https://0177.0.0.1/v1", error: /loopback endpoint/ },
    { apiUrl: "https://%61pi.openai.com/v1", error: /direct model provider/ },
    { apiUrl: "https://api%2eopenai.com/v1", error: /direct model provider/ },
    { apiUrl: "https://[fe80::1%25eth0]/v1", error: /absolute HTTPS URL/ },
    { apiUrl: "https://orchestrator-a.example/a\\b/v1", error: /canonical endpoint URL/ },
    { apiUrl: "https://orchestrator-a.example\\evil.example/v1", error: /canonical endpoint URL/ },
    { apiUrl: "https://foo..example/v1", error: /canonical endpoint URL/ },
    { apiUrl: `https://${"a".repeat(64)}.example/v1`, error: /canonical endpoint URL/ },
    { apiUrl: "https://[::ffff:192.0.2.1]/v1", error: /IPv4-mapped IPv6 endpoint/ },
    { apiUrl: "https://[::ffff:c000:201]/v1", error: /IPv4-mapped IPv6 endpoint/ },
  ])("rejects a non-canonical selected endpoint $apiUrl", async ({ apiUrl, error }) => {
    await expect(verifyOrchestratorGatewayContract({
      env: {
        NOEMA_LLM_API_URL: apiUrl,
        NOEMA_LLM_API_URL_ALLOWLIST_JSON: allowlistJson,
      },
      fetchImpl: vi.fn(),
    })).rejects.toThrow(error);
  });

  it("refuses token-bearing OpenCode config without exact membership", () => {
    expect(() => buildOpenCodeOrchestratorConfig({
      apiUrl: "https://attacker.example/v1",
      allowedApiUrls: fixture.allowed,
      model: "orchestrator/free",
    })).toThrow(/not an allowed released contextual-orchestrator endpoint/);
  });
});
