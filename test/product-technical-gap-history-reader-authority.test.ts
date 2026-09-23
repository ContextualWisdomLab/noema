import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ACTIVE_BASELINE = "docs/product-technical-gap-baseline.md";
const HISTORICAL_BASELINE = "docs/history/product-technical-gap-baseline-20260921.md";

const historicalAuthorityTests = [
  "test/documentation-live-open-pr-authority.test.ts",
  "test/external-json-cancellation-authority.test.ts",
  "test/release-protected-710-authority.test.ts",
  "test/release-protected-708-authority.test.ts",
  "test/documentation-worker-recovery-protected.test.ts",
  "test/documentation-recovery-authority-current.test.ts",
  "test/orchestrator-health-reader-authority.test.ts",
  "test/documentation-retention-hardening-current.test.ts",
  "test/cloudflare-control-plane-json-negotiation.test.ts",
  "test/orchestrator-health-cancellation-authority.test.ts",
  "test/cloudflare-response-cancellation-authority.test.ts",
  "test/documentation-codegraph-locked-body-current.test.ts",
  "test/documentation-exchange-locked-reader-current.test.ts",
  "test/documentation-current-trust-authority.test.ts",
  "test/documentation-post-trust-integration-authority.test.ts",
  "test/procedural-current-lifecycle-deadline-authority.test.ts",
  "test/product-technical-gap-current-candidate-contract.test.ts",
  "test/documentation-trusted-research-adapter-protected.test.ts",
  "test/orchestrator-health-media-authority.test.ts",
  "test/documentation-external-json-locked-reader-current.test.ts",
  "test/external-json-sync-cancel-documentation-authority.test.ts",
  "test/documentation-workflow-state-operability-protected.test.ts",
  "test/private-vulnerability-reporting-cancellation-authority.test.ts",
  "test/procedural-publication-preflight-protected-documentation.test.ts",
  "test/documentation-private-vulnerability-locked-reader-current.test.ts",
  "test/cloudflare-response-bounds.test.ts",
  "test/release-immutable-policy-auth.test.ts",
  "test/procedural-current-lifecycle-media-authority.test.ts",
] as const;

describe("product-technical gap historical authority readers", () => {
  it("keeps protected-lineage assertions on the byte-preserved archive after the active baseline split", () => {
    for (const path of historicalAuthorityTests) {
      const source = readFileSync(path, "utf8");
      expect(source, path).toContain(HISTORICAL_BASELINE);
      expect(source, path).not.toContain(`readFileSync("${ACTIVE_BASELINE}", "utf8")`);
    }
  });

  it("keeps workflow/concurrency merge admission on the active baseline", () => {
    const source = readFileSync("test/documentation-workflow-concurrency-authority.test.ts", "utf8");
    expect(source).toContain(`readFileSync("${ACTIVE_BASELINE}", "utf8")`);
    expect(source).not.toContain(HISTORICAL_BASELINE);
  });
});
