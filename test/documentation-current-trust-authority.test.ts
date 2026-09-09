import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("current protected trust authority documentation", () => {
  it("separates current protected source, moving central head, and immutable pin", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(baseline).toContain("protected `main@e3aa77c3f678336c548440f355f988345b0ba976`");
    expect(baseline).toContain("central `.github/main@7fd571dbcdbae6acf29d8f4ee704d7ba6297e4db`");
    expect(baseline).toContain("`ALLOWED_WORKFLOW_SHA = c9052e607e5f3cc76e73207e7786b21500721b79`");
    expect(baseline).toContain("Current source SHA는 moving observation이며 future merge 뒤 evergreen identity로 취급하지 않는다");
    expect(baseline).toContain("Moving foreign head와 reviewed immutable pin을 같은 권위로 취급하지 않으며");
    expect(baseline).toContain("merged PR #560 exact `5aab7c098f3478069127f34e398326415ec599a4`");
    expect(baseline).not.toContain("protected `main@36e5cf957ee20a8bb3e19ff50fea6c97771d2ba1`다");
    expect(baseline).not.toContain("central `.github/main@78a4937c684a54ca8e415822c913742f41c6efc4`");
  });
});
