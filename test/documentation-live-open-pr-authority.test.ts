import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("product-technical gap baseline live open-PR authority", () => {
  it("treats #556 as integrated history and #560 as the active candidate", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(baseline).toContain("Resulting protected merge는 GitHub-verified `36e5cf957ee20a8bb3e19ff50fea6c97771d2ba1`");
    expect(baseline).toContain("Observed PR #560 exact `83a54b699e9b5678b6f41125f57cb36fc5ce9597`");
    expect(baseline).toContain("application CI `34213481992`");
    expect(baseline).toContain("Policy / Approval issuance");
    expect(baseline).toContain("Production `c6e91dbe8b452e067d30890aae993b04b7cd814c`");
    expect(baseline).toContain("ordinary/non-force semantic restack");
    expect(baseline).toContain("CHANGELOG semantic union");
    expect(baseline).not.toContain("Observed PR #556 exact");
    expect(baseline).not.toContain("Observed PR #560 exact `68f28439edfd92394723ebc1248a6b2e9a957d44`");
    expect(baseline).not.toContain("Observed PR #560 exact `935b99e1704b5a9966057a886dc60640d6bda5e2`");
    expect(baseline).not.toContain("application CI `34209618966`");
  });
});
