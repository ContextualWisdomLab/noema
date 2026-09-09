import { describe, expect, it } from "vitest";
import * as lifecycleEvidence from "../scripts/lib/external-extension-lifecycle-operability-evidence.mjs";

describe("external-extension lifecycle deployment provenance binding", () => {
  it("exposes a provenance-bound evaluator instead of treating content-shape validation as release authority", () => {
    expect(
      typeof (lifecycleEvidence as Record<string, unknown>)
        .evaluateExternalExtensionLifecycleOperabilityEvidenceWithDeploymentAuthority,
    ).toBe("function");
  });
});
