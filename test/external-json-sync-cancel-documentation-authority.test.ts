import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("protected #676 synchronous-cancel documentation authority", () => {
  it("keeps CHANGELOG and product-gap authority aligned with protected source", () => {
    const changelog = readFileSync("CHANGELOG.md", "utf8");
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(changelog).toContain("PR #676.");
    expect(changelog).toContain("synchronous cancellation throw");
    expect(changelog).toContain("immutable release");

    expect(baseline).toContain(
      "merged PR #676 exact `f8de7fc27d475c76477271fa50dd7032afd82a6c`",
    );
    expect(baseline).toContain(
      "Protected #676 closes the synchronous external JSON cancellation-fault gap",
    );
    expect(baseline).toContain(
      "#676 does not transfer OIDC/GitHub identity, provider routing, destination/outbound policy, credential authority, quarantine/security authority, release/deployment authority, or foreign domain truth to Noema",
    );
    expect(baseline).toContain(
      "immutable release and deployed heap/p95 evidence remain separate",
    );
  });
});
