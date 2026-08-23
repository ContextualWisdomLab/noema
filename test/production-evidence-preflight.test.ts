import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function runPreflight(env: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, ["scripts/production-evidence-preflight.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...env,
    },
    encoding: "utf8",
  });
}

function validProductionEnvironment(overrides: NodeJS.ProcessEnv = {}) {
  return {
    NOEMA_EXCHANGE_URL: "https://noema.acme-corp.com/exchange",
    NOEMA_KPI_SOURCE_KIND: "production",
    NOEMA_KPI_SOURCE_ID: "cloudflare-logpush:noema-production",
    NOEMA_KPI_LOG_URL: "https://logs.example.com/exchange-30d.ndjson",
    ...overrides,
  };
}

function canonicalExchangeUrlOfLength(length: 2048 | 2049) {
  const fixedCharacters = "https://".length + "/exchange".length;
  const hostnameLength = length - fixedCharacters;
  const fullLabels = Math.floor((hostnameLength - 1) / 64);
  const trailingLabelLength = hostnameLength - (fullLabels * 64);
  const hostname = [
    ...Array(fullLabels).fill("a".repeat(63)),
    "b".repeat(trailingLabelLength),
  ].join(".");
  const url = `https://${hostname}/exchange`;
  if (url.length !== length) {
    throw new Error(`test fixture length mismatch: expected ${length}, received ${url.length}`);
  }
  return url;
}

describe("production-evidence-preflight", () => {
  it("fails closed when production evidence inputs are missing", () => {
    const result = runPreflight();
    const output = JSON.parse(result.stdout);

    expect(result.status).toBe(1);
    expect(output.passed).toBe(false);
    expect(output.checks.map((check: { name: string }) => check.name)).toContain("NOEMA_EXCHANGE_URL");
    expect(output.checks.map((check: { name: string }) => check.name)).toContain("NOEMA_KPI_SOURCE_KIND");
    expect(output.checks.map((check: { name: string }) => check.name)).toContain("NOEMA_KPI_SOURCE_ID");
    expect(output.checks.map((check: { name: string }) => check.name)).toContain("NOEMA_KPI_LOG_URL_OR_TAIL_COMMAND");
  });

  it("passes when production smoke and KPI collection inputs are present", () => {
    const result = runPreflight(validProductionEnvironment());
    const output = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(output.passed).toBe(true);
  });

  it("rejects ambiguous KPI collection inputs", () => {
    const result = runPreflight(validProductionEnvironment({
      NOEMA_KPI_TAIL_COMMAND: "collector",
    }));
    const output = JSON.parse(result.stdout);
    const sourceInput = output.checks.find(
      (check: { name: string }) => check.name === "NOEMA_KPI_LOG_URL_OR_TAIL_COMMAND",
    );

    expect(result.status).toBe(1);
    expect(output.passed).toBe(false);
    expect(sourceInput).toMatchObject({
      status: "FAIL",
      message: expect.stringContaining("exactly one"),
    });
  });

  it.each([
    "http://noema.acme-corp.com/exchange",
    "https://user:pass@noema.acme-corp.com/exchange",
    "https://noema.acme-corp.com/foo/exchange",
    "https://noema.acme-corp.com/exchange?probe=1",
    "https://noema.acme-corp.com/exchange#fragment",
    "https://noema.acme-corp.com:443/exchange",
    " https://noema.acme-corp.com/exchange ",
  ])("rejects non-canonical production exchange endpoint %s", (exchangeUrl) => {
    const result = runPreflight(validProductionEnvironment({
      NOEMA_EXCHANGE_URL: exchangeUrl,
    }));
    const output = JSON.parse(result.stdout);

    expect(result.status).toBe(1);
    expect(output.passed).toBe(false);
    expect(output.checks.find((check: { name: string }) => check.name === "NOEMA_EXCHANGE_URL").status).toBe("FAIL");
  });

  it.each([
    "https://localhost/exchange",
    "https://localhost./exchange",
    "https://tenant.localhost/exchange",
    "https://127.0.0.1/exchange",
    "https://0.0.0.0/exchange",
    "https://169.254.169.254/exchange",
    "https://[::1]/exchange",
    "https://[::]/exchange",
    "https://[::ffff:7f00:1]/exchange",
    "https://[fe80::1]/exchange",
  ])("rejects local-only or link-local production exchange endpoint %s", (exchangeUrl) => {
    const result = runPreflight(validProductionEnvironment({
      NOEMA_EXCHANGE_URL: exchangeUrl,
    }));
    const output = JSON.parse(result.stdout);

    expect(result.status).toBe(1);
    expect(output.passed).toBe(false);
    expect(output.checks.find((check: { name: string }) => check.name === "NOEMA_EXCHANGE_URL").status).toBe("FAIL");
  });

  it.each([
    "https://0.0.0.1/exchange",
    "https://224.0.0.1/exchange",
    "https://255.255.255.255/exchange",
    "https://[ff02::1]/exchange",
  ])("rejects non-unicast production exchange endpoint %s", (exchangeUrl) => {
    const result = runPreflight(validProductionEnvironment({
      NOEMA_EXCHANGE_URL: exchangeUrl,
    }));
    const output = JSON.parse(result.stdout);

    expect(result.status).toBe(1);
    expect(output.passed).toBe(false);
    expect(output.checks.find((check: { name: string }) => check.name === "NOEMA_EXCHANGE_URL").status).toBe("FAIL");
  });

  it.each([
    "https://noema.example.com/exchange",
    "https://noema.example.net/exchange",
    "https://noema.example.org/exchange",
    "https://noema.example/exchange",
    "https://noema.invalid/exchange",
    "https://noema.test/exchange",
    "https://service.local/exchange",
    "https://192.0.2.10/exchange",
    "https://198.51.100.10/exchange",
    "https://203.0.113.10/exchange",
    "https://[2001:db8::1]/exchange",
  ])("rejects reserved or documentation-only production endpoint %s", (exchangeUrl) => {
    const result = runPreflight(validProductionEnvironment({
      NOEMA_EXCHANGE_URL: exchangeUrl,
    }));
    const output = JSON.parse(result.stdout);

    expect(result.status).toBe(1);
    expect(output.passed).toBe(false);
    expect(output.checks.find((check: { name: string }) => check.name === "NOEMA_EXCHANGE_URL").status).toBe("FAIL");
  });

  it("preserves private enterprise production endpoints that are not local-only", () => {
    const result = runPreflight(validProductionEnvironment({
      NOEMA_EXCHANGE_URL: "https://10.0.0.5/exchange",
    }));
    const output = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(output.passed).toBe(true);
  });

  it("matches the smoke operator's 2048-character endpoint ceiling", () => {
    const atLimit = runPreflight(validProductionEnvironment({
      NOEMA_EXCHANGE_URL: canonicalExchangeUrlOfLength(2048),
    }));
    const overLimit = runPreflight(validProductionEnvironment({
      NOEMA_EXCHANGE_URL: canonicalExchangeUrlOfLength(2049),
    }));
    const atLimitOutput = JSON.parse(atLimit.stdout);
    const overLimitOutput = JSON.parse(overLimit.stdout);

    expect(atLimit.status).toBe(0);
    expect(atLimitOutput.passed).toBe(true);
    expect(overLimit.status).toBe(1);
    expect(overLimitOutput.passed).toBe(false);
    expect(overLimitOutput.checks.find((check: { name: string }) => check.name === "NOEMA_EXCHANGE_URL")).toMatchObject({
      status: "FAIL",
      message: expect.stringContaining("2048"),
    });
  });

  it("allows non-secret labels that contain key as part of another word", () => {
    const result = runPreflight({
      NOEMA_EXCHANGE_URL: "https://noema.acme-corp.com/exchange",
      NOEMA_KPI_SOURCE_KIND: "production",
      NOEMA_KPI_SOURCE_ID: "cloudflare-logpush:hockey-prod",
      NOEMA_KPI_LOG_URL: "https://logs.example.com/exchange-30d.ndjson",
    });
    const output = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(output.passed).toBe(true);
  });

  it("rejects source ids that look like secrets", () => {
    const result = runPreflight({
      NOEMA_EXCHANGE_URL: "https://noema.acme-corp.com/exchange",
      NOEMA_KPI_SOURCE_KIND: "production",
      NOEMA_KPI_SOURCE_ID: "archive?api_key=secret",
      NOEMA_KPI_LOG_URL: "https://logs.example.com/exchange-30d.ndjson",
    });
    const output = JSON.parse(result.stdout);

    expect(result.status).toBe(1);
    expect(output.checks.find((check: { name: string }) => check.name === "NOEMA_KPI_SOURCE_ID").status).toBe("FAIL");
  });

  it("rejects placeholder source ids", () => {
    const result = runPreflight({
      NOEMA_EXCHANGE_URL: "https://noema.acme-corp.com/exchange",
      NOEMA_KPI_SOURCE_KIND: "production",
      NOEMA_KPI_SOURCE_ID: "replace-with-log-source",
      NOEMA_KPI_LOG_URL: "https://logs.example.com/exchange-30d.ndjson",
    });
    const output = JSON.parse(result.stdout);

    expect(result.status).toBe(1);
    expect(output.checks.find((check: { name: string }) => check.name === "NOEMA_KPI_SOURCE_ID").status).toBe("FAIL");
  });
});
