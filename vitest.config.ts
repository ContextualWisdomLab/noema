import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      reporter: ["json-summary", "text"],
      include: [
        "src/**/*.ts",
        "scripts/actions-runner-assignment-audit.mjs",
        "scripts/kpi-gate.mjs",
        "scripts/lockfile-change-control.mjs",
        "scripts/maintainer-app-readiness.mjs",
        "scripts/normalize-commercial-readiness-evidence.mjs",
        "scripts/prepare-agent-pr-message.mjs",
        "scripts/verify-orchestrator-gateway.mjs",
        "scripts/lib/orchestrator-gateway.mjs",
        "scripts/workflow-registry-audit.mjs",
        "scripts/workflow-registry-disable-plan.mjs",
        "scripts/workflow-registry-live-disable.mjs",
        "scripts/production-environment-governance-audit.mjs",
        "scripts/lib/external-scheduler-evidence-audit.mjs",
        "scripts/lib/stable-file-evidence.mjs",
        "scripts/lib/strict-json-evidence.mjs",
        "scripts/lib/acquisition-data-room-catalog.mjs",
        "scripts/lib/acquisition-data-room-integrity.mjs",
        "scripts/lib/acquisition-git-preflight.mjs",
        "scripts/lib/acquisition-private-output.mjs",
        "scripts/external-scheduler-evidence-audit.mjs",
      ],
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100,
      },
    },
  },
});
