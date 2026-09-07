import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("current protected trust authority documentation", () => {
  it("binds the commercial gap baseline to the current protected central source and integrated consumer", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(baseline).toContain(
      "Central workflow authority는 `.github/main@c9052e607e5f3cc76e73207e7786b21500721b79`다.",
    );
    expect(baseline).toContain(
      "merged PR #554 exact `01c0a0061a360ea1e3a9586e67744466f7544672`",
    );
    expect(baseline).toContain(
      "`main@5cd6341866a53351ff412415f677ec2fef23ea33`",
    );
    expect(baseline).not.toContain(
      "`.github/main@bf0bf0ab0c9ebcf4cea05f8c9219dc093f9ab351`",
    );
    expect(baseline).not.toContain(
      "PR #554 exact `e94d3ee884a120269fc42cf09ecbab6d0461b4ef`",
    );
  });
});