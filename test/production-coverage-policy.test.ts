import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("production coverage policy", () => {
  it("executes the production coverage gate in every release verification", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

    expect(packageJson.scripts.test).toBe("vitest run --coverage");
    expect(packageJson.scripts["release:verify"]).toContain("npm run test");
    expect(packageJson.scripts["release:verify:strict"]).toContain("npm run test");
  });

  it("covers the Worker and repository-owned production evidence tools at 100 percent", () => {
    const configuration = readFileSync("vitest.config.ts", "utf8");

    for (const productionPath of [
      '"src/**/*.ts"',
      '"scripts/normalize-commercial-readiness-evidence.mjs"',
      '"scripts/prepare-agent-pr-message.mjs"',
      '"scripts/lib/external-scheduler-evidence-audit.mjs"',
      '"scripts/external-scheduler-evidence-audit.mjs"',
    ]) {
      expect(configuration).toContain(productionPath);
    }
    for (const metric of ["lines", "branches", "functions", "statements"]) {
      expect(configuration).toContain(`${metric}: 100`);
    }
  });

  it("keeps the public credential-exchange success path inside measured production coverage", () => {
    const source = readFileSync("src/index.ts", "utf8");
    const handleExchangeStart = source.indexOf("async function handleExchange");
    const workerEntrypointStart = source.indexOf("/**\n * Base public Worker entrypoint", handleExchangeStart);

    expect(handleExchangeStart).toBeGreaterThanOrEqual(0);
    expect(workerEntrypointStart).toBeGreaterThan(handleExchangeStart);

    const handleExchangeSource = source.slice(handleExchangeStart, workerEntrypointStart);
    expect(handleExchangeSource).not.toContain("/* v8 ignore start */");
    expect(handleExchangeSource).not.toContain("/* v8 ignore stop */");
  });

  it("keeps replay and target-request authorization inside measured production coverage", () => {
    const source = readFileSync("src/index.ts", "utf8");
    const replayCoreStart = source.indexOf("async function claimVerifiedOidcUsage");
    const handleExchangeStart = source.indexOf("async function handleExchange", replayCoreStart);

    expect(replayCoreStart).toBeGreaterThanOrEqual(0);
    expect(handleExchangeStart).toBeGreaterThan(replayCoreStart);

    const replayRequestCore = source.slice(replayCoreStart, handleExchangeStart);
    expect(replayRequestCore).not.toContain("/* v8 ignore start */");
    expect(replayRequestCore).not.toContain("/* v8 ignore stop */");
  });

  it("keeps GitHub App credential runtime inside measured production coverage", () => {
    const source = readFileSync("src/index.ts", "utf8");
    const githubAppCoreStart = source.indexOf("async function importGithubAppPrivateKey");
    const requestBodyStart = source.indexOf("async function parseExchangeRequestBody", githubAppCoreStart);

    expect(githubAppCoreStart).toBeGreaterThanOrEqual(0);
    expect(requestBodyStart).toBeGreaterThan(githubAppCoreStart);

    const githubAppCore = source.slice(githubAppCoreStart, requestBodyStart);
    expect(githubAppCore).not.toContain("/* v8 ignore start */");
    expect(githubAppCore).not.toContain("/* v8 ignore stop */");
  });

  it("removes unreachable fallback branches from the measured GitHub API adapter", () => {
    const source = readFileSync("src/index.ts", "utf8");
    const githubJsonStart = source.indexOf("async function githubJson");
    const resolveInstallationStart = source.indexOf("async function resolveInstallationId", githubJsonStart);

    expect(githubJsonStart).toBeGreaterThanOrEqual(0);
    expect(resolveInstallationStart).toBeGreaterThan(githubJsonStart);

    const githubJsonSource = source.slice(githubJsonStart, resolveInstallationStart);
    expect(githubJsonSource).not.toContain("...(init.headers || {})");
    expect(githubJsonSource).not.toContain("response.status >= 400 && response.status < 500");
  });
});
