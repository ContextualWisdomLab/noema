import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts", "test/**/*.test.mjs"],
    coverage: {
      reporter: ["json-summary", ["text", { maxCols: 240 }]],
      include: [
        "src/**/*.ts",
        "patch-validator/entrypoint.mjs",
        "patch-validator/validate-patch.mjs",
        "patch-validator/runtime.mjs",
        "scripts/lib/patch-validator-image-receipts.mjs",
        "scripts/lib/patch-validator-smoke-diagnostic.mjs",
        "scripts/lib/patch-validator-static-runtime-evidence.mjs",
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
