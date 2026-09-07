import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("current protected trust authority documentation", () => {
  it("separates current central control-plane head from the reviewed consumer workflow pin", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(baseline).toContain(
      "central `.github/main@78a4937c684a54ca8e415822c913742f41c6efc4`",
    );
    expect(baseline).toContain(
      "`ALLOWED_WORKFLOW_SHA = c9052e607e5f3cc76e73207e7786b21500721b79`",
    );
    expect(baseline).toContain(
      "protected `main@4c1d174adae3a3cc1ced54913ac2515d768647ef`",
    );
    expect(baseline).toContain(
      "merged PR #536 exact `4fe6fe84611dfa1d69d8e0712b72b278429524d0`",
    );
    expect(baseline).not.toContain(
      "Central workflow authority는 `.github/main@c9052e607e5f3cc76e73207e7786b21500721b79`다.",
    );
    expect(baseline).not.toContain(
      "현재 protected-source snapshot은 `main@5cd6341866a53351ff412415f677ec2fef23ea33`",
    );
  });
});
