import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      reporter: ["json-summary", "text"],
      include: [
        "src/**/*.ts",
        "scripts/normalize-commercial-readiness-evidence.mjs",
        "scripts/prepare-agent-pr-message.mjs",
        "scripts/lib/external-scheduler-evidence-audit.mjs",
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
