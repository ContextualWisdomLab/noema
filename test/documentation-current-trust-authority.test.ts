import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("current protected trust authority documentation", () => {
  it("binds the commercial gap baseline to the latest protected central source and consumer candidate", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(baseline).toContain(
      "Central workflow authority는 `.github/main@c9052e607e5f3cc76e73207e7786b21500721b79`다.",
    );
    expect(baseline).toContain(
      "PR #554 exact `01c0a0061a360ea1e3a9586e67744466f7544672`",
    );
    expect(baseline).toContain(
      "superseded predecessor `.github/main@bf0bf0ab0c9ebcf4cea05f8c9219dc093f9ab351` / PR #554 exact `e94d3ee884a120269fc42cf09ecbab6d0461b4ef`",
    );
  });
});
