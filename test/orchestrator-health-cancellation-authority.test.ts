import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("protected orchestrator health cancellation-liveness documentation authority", () => {
  it("records protected #670 without promoting release or service authority", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");
    const changelog = readFileSync("CHANGELOG.md", "utf8");
    const source = readFileSync("scripts/lib/orchestrator-gateway.mjs", "utf8");

    expect(baseline).toContain(
      "merged PR #670 exact `14b4c9a46692df0084a03b9a3b2ae4acf1178a83`",
    );
    expect(baseline).toContain(
      "Protected #670 closes the contextual-orchestrator health response cancellation-liveness gap",
    );
    expect(baseline).toContain(
      "#670 remains protected source evidence; immutable release and deployed availability/p95 evidence remain separate",
    );
    expect(baseline).toContain(
      "#670 does not transfer contextual-orchestrator service, provider/model routing, credential, outbound, quarantine/security, or foreign domain authority to Noema",
    );
    expect(changelog).toContain("PR #670.");

    expect(source).toContain("void response.body?.cancel?.().catch(() => undefined);");
    expect(source).toContain("void reader.cancel().catch(() => undefined);");
    expect(source).not.toContain("await response.body?.cancel?.();");
    expect(source).not.toContain("await reader.cancel();");
  });
});
