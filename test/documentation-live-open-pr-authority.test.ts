import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("product-technical gap baseline live open-PR authority", () => {
  it("treats #556 as integrated history and #560 as the active candidate", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(baseline).toContain("Resulting protected merge는 GitHub-verified `36e5cf957ee20a8bb3e19ff50fea6c97771d2ba1`");
    expect(baseline).toContain("Observed PR #560 exact `f8703e6628961d380df59e4e90b600ebad215c11`");
    expect(baseline).toContain("Hosted application CI `34221586992`, job `102045717213`");
    expect(baseline).toContain("application CI `34222306594`");
    expect(baseline).toContain("Policy / Approval issuance");
    expect(baseline).toContain("Production `2b50b35b7bdbb834f571dfcae50dceb05766244c`");
    expect(baseline).toContain("runtime wall clock");
    expect(baseline).toContain("ordinary/non-force");
    expect(baseline).not.toContain("Observed PR #556 exact");
    expect(baseline).not.toContain("Observed PR #560 exact `802b0bff0f32c170ada328b04e87e0db43ee7cd4`");
    expect(baseline).not.toContain("application CI `34219296338`");
  });
});
