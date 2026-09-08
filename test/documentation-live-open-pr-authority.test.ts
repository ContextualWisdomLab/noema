import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("product-technical gap baseline live open-PR authority", () => {
  it("treats #556 as integrated history and #560 as the active candidate", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(baseline).toContain("Resulting protected merge는 GitHub-verified `36e5cf957ee20a8bb3e19ff50fea6c97771d2ba1`");
    expect(baseline).toContain("Observed PR #560 exact `935b99e1704b5a9966057a886dc60640d6bda5e2`");
    expect(baseline).toContain("application CI `34209618966`");
    expect(baseline).toContain("Policy / Approval issuance");
    expect(baseline).toContain("Production `c6e91dbe8b452e067d30890aae993b04b7cd814c`");
    expect(baseline).toContain("ordinary/non-force restack");
    expect(baseline).not.toContain("Observed PR #556 exact");
    expect(baseline).not.toContain("Observed PR #560 test-only exact `7ca9aebee6f92053913c0bbc665c8de77650891f`");
  });
});
