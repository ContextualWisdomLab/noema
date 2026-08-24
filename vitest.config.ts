import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts", "test/**/*.test.mjs"],
    // Real acquisition-integrity tests execute the production audit, whose
    // child-process boundary is itself capped at 30 seconds. Keep the outer
    // harness bounded but give it enough time to observe that explicit result
    // instead of failing first at Vitest's 5-second default on hosted runners.
    testTimeout: 35_000,
    coverage: {
      reporter: ["json-summary", "text"],
      include: [
        "src/**/*.ts",
        "patch-validator/entrypoint.mjs",
        "patch-validator/validate-patch.mjs",
        "patch-validator/runtime.mjs",
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
        "scripts/lib/release-sbom-authority.mjs",
        "scripts/lib/patch-validator-binary-grype-database-binding.mjs",
        "scripts/lib/patch-validator-image-receipts.mjs",
        "scripts/lib/patch-validator-smoke-diagnostic.mjs",
        "scripts/lib/patch-validator-static-runtime-evidence.mjs",
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