import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("saleable readiness subprocess authority", () => {
  it("passes only the explicit non-secret runtime contract to child commands", () => {
    const script = readFileSync("scripts/saleable-readiness-audit.mjs", "utf8");

    expect(script).toContain("readinessSubprocessEnvironmentKeys");
    expect(script).toContain("createReadinessSubprocessEnvironment");
    expect(script).toContain("const env = createReadinessSubprocessEnvironment(options.env)");
    expect(script).not.toContain("...process.env");

    for (const requiredRuntimeKey of [
      "PATH",
      "PATHEXT",
      "SystemRoot",
      "ComSpec",
      "CI",
      "NO_COLOR",
      "TZ",
      "LANG",
      "LC_ALL",
      "NODE_EXTRA_CA_CERTS",
      "SSL_CERT_FILE",
      "SSL_CERT_DIR",
      "NOEMA_KPI_FAILURE_THRESHOLD",
      "NOEMA_KPI_P95_THRESHOLD_MS",
      "NOEMA_KPI_REQUIRE_WINDOW_DAYS",
      "NOEMA_KPI_LOG_PATH",
      "NOEMA_KPI_PROVENANCE_PATH",
      "NOEMA_KPI_EVIDENCE_PATH",
      "NOEMA_ALERT_5M_FAILURE_RATE",
      "NOEMA_ALERT_5M_P95_MS",
      "NOEMA_ALERT_RATE_LIMIT_MINUTES",
      "NOEMA_ALERT_WORKFLOW_SPIKE_MULTIPLIER",
    ]) {
      expect(script).toContain(`\"${requiredRuntimeKey}\"`);
    }

    for (const forbiddenAmbientAuthority of [
      "NVIDIA_NIM_API_KEY",
      "GH_TOKEN",
      "GITHUB_TOKEN",
      "NOEMA_MAINTAINER_APP_PRIVATE_KEY",
      "NOEMA_REVIEWER_APP_PRIVATE_KEY",
      "CLOUDFLARE_API_TOKEN",
      "NODE_OPTIONS",
      "HTTPS_PROXY",
      "HTTP_PROXY",
    ]) {
      expect(script).not.toContain(`\"${forbiddenAmbientAuthority}\"`);
    }
  });
});
