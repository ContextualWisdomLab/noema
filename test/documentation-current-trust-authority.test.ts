import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("current protected trust authority documentation", () => {
  it("separates live current authority from dated source observations and immutable pins", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(baseline).toContain(
      "Current protected source는 mutation·merge·release 시점에 live protected `main`을 다시 조회해 결정한다",
    );
    expect(baseline).toContain(
      "Dated protected observation for this repair는 `main@b946d04236613544ceedb2160ed68b4e6d855dd8`",
    );
    expect(baseline).toContain("merged PR #582 exact `0f20a4dc78e423fd5df49e137a4eb286c7075ea4`");
    expect(baseline).toContain("central `.github/main@7fd571dbcdbae6acf29d8f4ee704d7ba6297e4db`");
    expect(baseline).toContain("`ALLOWED_WORKFLOW_SHA = c9052e607e5f3cc76e73207e7786b21500721b79`");
    expect(baseline).toContain("Moving foreign head와 reviewed immutable pin을 같은 권위로 취급하지 않으며");
    expect(baseline).not.toMatch(
      /Current protected source는 GitHub-verified protected `main@[0-9a-f]{40}`/,
    );
    expect(baseline).not.toContain(
      "#559가 `docs/product-technical-gap-baseline.md`와 executable documentation-authority tests의 sole writer다",
    );
  });
});
