import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("product-technical gap baseline live open-PR authority", () => {
  it("treats #556 as integrated history and #560 as the active candidate", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(baseline).toContain("Resulting protected merge는 GitHub-verified `36e5cf957ee20a8bb3e19ff50fea6c97771d2ba1`");
    expect(baseline).toContain("Observed PR #560 exact `273aa711d1c7611fadab9346944891548b30919a`");
    expect(baseline).toContain("Hosted application CI `34221586992`, job `102045717213`");
    expect(baseline).toContain("application CI `34235257622`");
    expect(baseline).toContain("Policy / Approval issuance");
    expect(baseline).toContain("Production `2b50b35b7bdbb834f571dfcae50dceb05766244c`");
    expect(baseline).toContain("runtime wall clock");
    expect(baseline).toContain("Test-only replay RED `cb8ad638875b761aea70aba78a480bd5031c4d7d`");
    expect(baseline).toContain("Production `9c7ae13f7053fa368fd778c3909c4428d1bdf28e`");
    expect(baseline).toContain("Coverage repair `83ee8e9b54be7ea59cfa11fe03e4ad0c6414950c`");
    expect(baseline).toContain("Unbound core-receipt RED `5a50a9bcfe12f3938b30e4a3cb15af8d30134391`");
    expect(baseline).toContain("Production `cbb64def35bad02024076c1db74e9da4739ae736`");
    expect(baseline).toContain("public invocation-envelope authority");
    expect(baseline).toContain("Activation-time revocation RED `8ff77d9b6428a2c09f2c72bf3b05fdb989e35843`");
    expect(baseline).toContain("Production `8251d4bcd2c81dd13d252a576b55dc21e66db9c4`");
    expect(baseline).toContain("before issuing an activation");
    expect(baseline).toContain("Invocation-authority substitution RED `abcd1fea4b28b826826fed6b23296b59ceda98ca`");
    expect(baseline).toContain("Production `f8814b8fd7b66f40335df85c6aadab12aa760bc1`");
    expect(baseline).toContain("same admission-bound authority instance");
    expect(baseline).toContain("hidden mutable `lastAdmissionAuthority` cache");
    expect(baseline).toContain("ordinary/non-force");
    expect(baseline).not.toContain("Observed PR #556 exact");
    expect(baseline).not.toContain("Observed PR #560 exact `802b0bff0f32c170ada328b04e87e0db43ee7cd4`");
    expect(baseline).not.toContain("application CI `34219296338`");
    expect(baseline).not.toContain("Observed PR #560 exact `83ee8e9b54be7ea59cfa11fe03e4ad0c6414950c`");
    expect(baseline).not.toContain("Observed PR #560 exact `cbb64def35bad02024076c1db74e9da4739ae736`");
    expect(baseline).not.toContain("Observed PR #560 exact `8251d4bcd2c81dd13d252a576b55dc21e66db9c4`");
  });
});
