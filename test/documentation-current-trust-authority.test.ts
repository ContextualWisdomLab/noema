import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("current protected trust authority documentation", () => {
  it("separates current protected source, moving central head, and immutable pin", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(baseline).toContain("protected `main@36e5cf957ee20a8bb3e19ff50fea6c97771d2ba1`");
    expect(baseline).toContain("central `.github/main@7fd571dbcdbae6acf29d8f4ee704d7ba6297e4db`");
    expect(baseline).toContain("`ALLOWED_WORKFLOW_SHA = c9052e607e5f3cc76e73207e7786b21500721b79`");
    expect(baseline).toContain("Current source SHA는 moving observation이며 future merge 뒤 evergreen identity로 취급하지 않는다");
    expect(baseline).toContain("Moving foreign head와 reviewed immutable pin을 같은 권위로 취급하지 않으며");
    expect(baseline).toContain("merged PR #556 exact `860714cba46dba06260a5dce09d0e9152fcb0a8c`");
    expect(baseline).not.toContain("protected `main@0dbfceb850cda3a016ceb39ae1c8a1a96a9f2ad5`");
    expect(baseline).not.toContain("central `.github/main@78a4937c684a54ca8e415822c913742f41c6efc4`");
  });
});
