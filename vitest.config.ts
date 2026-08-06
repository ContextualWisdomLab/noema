import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts", "test/**/*.test.mjs"],
    coverage: {
      reporter: ["json-summary", "text"],
      include: [
        "src/**/*.ts",
        "patch-validator/runtime.mjs",
        "scripts/normalize-commercial-readiness-evidence.mjs",
        "scripts/prepare-agent-pr-message.mjs",
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
