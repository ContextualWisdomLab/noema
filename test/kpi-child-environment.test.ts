import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const hostileParentEnvironment: NodeJS.ProcessEnv = {
  PATH: "/synthetic/bin",
  HOME: "/synthetic/home",
  NODE_OPTIONS: "--require=/synthetic/preload.cjs",
  NODE_PATH: "/synthetic/node_modules",
  GITHUB_TOKEN: "synthetic-github-token",
  GH_TOKEN: "synthetic-gh-token",
  COPILOT_GITHUB_TOKEN: "synthetic-copilot-token",
  NVIDIA_NIM_API_KEY: "synthetic-nim-key",
  NOEMA_LLM_API_KEY: "synthetic-model-key",
  NOEMA_MAINTAINER_APP_CLIENT_ID: "synthetic-maintainer-client",
  NOEMA_MAINTAINER_APP_PRIVATE_KEY: "synthetic-maintainer-private-key",
  NOEMA_REVIEWER_APP_CLIENT_ID: "synthetic-reviewer-client",
  NOEMA_REVIEWER_APP_PRIVATE_KEY: "synthetic-reviewer-private-key",
  CLOUDFLARE_API_TOKEN: "synthetic-cloudflare-token",
  CLOUDFLARE_ACCOUNT_ID: "synthetic-cloudflare-account",
  AWS_SECRET_ACCESS_KEY: "synthetic-provider-key",
  HTTP_PROXY: "http://synthetic-proxy.invalid",
  HTTPS_PROXY: "https://synthetic-proxy.invalid",
  ALL_PROXY: "socks5://synthetic-proxy.invalid",
  NOEMA_UNRELATED_STATE: "synthetic-unrelated-state",
  NOEMA_KPI_REQUIRE_WINDOW_DAYS: "999",
  NOEMA_ALERT_5M_FAILURE_RATE: "0.07",
  NOEMA_ALERT_5M_P95_MS: "640",
  NOEMA_ALERT_RATE_LIMIT_MINUTES: "4",
  NOEMA_ALERT_WORKFLOW_SPIKE_MULTIPLIER: "5",
};

async function loadEnvironmentFactory() {
  const modulePath = "../scripts/lib/kpi-child-environment.mjs";
  return import(modulePath);
}

describe("KPI child-process least-authority environment", () => {
  it("routes every KPI child through the declared environment contract", () => {
    const source = readFileSync("scripts/kpi-gate.mjs", "utf8");

    expect(source).toContain(
      'import { createKpiChildEnvironment } from "./lib/kpi-child-environment.mjs";',
    );
    expect(source).not.toContain("const kpiChildEnvironment = { ...process.env }");
    expect(source).toContain("env: createKpiChildEnvironment(step.name, process.env, step.env ?? {}),");
  });

  it("gives kpi-check only its explicit strict-window input", async () => {
    const { createKpiChildEnvironment } = await loadEnvironmentFactory();

    expect(createKpiChildEnvironment(
      "kpi-check",
      hostileParentEnvironment,
      { NOEMA_KPI_REQUIRE_WINDOW_DAYS: "30" },
    )).toEqual({
      NOEMA_KPI_REQUIRE_WINDOW_DAYS: "30",
    });
  });

  it("gives kpi-alert only the four reviewed alert-threshold inputs", async () => {
    const { createKpiChildEnvironment } = await loadEnvironmentFactory();

    expect(createKpiChildEnvironment("kpi-alert", hostileParentEnvironment, {})).toEqual({
      NOEMA_ALERT_5M_FAILURE_RATE: "0.07",
      NOEMA_ALERT_5M_P95_MS: "640",
      NOEMA_ALERT_RATE_LIMIT_MINUTES: "4",
      NOEMA_ALERT_WORKFLOW_SPIKE_MULTIPLIER: "5",
    });
  });

  it("fails closed instead of widening authority for an unknown child", async () => {
    const { createKpiChildEnvironment } = await loadEnvironmentFactory();

    expect(() => createKpiChildEnvironment(
      "future-kpi-child",
      hostileParentEnvironment,
      {},
    )).toThrow(/Unknown KPI child step/u);
  });
});
