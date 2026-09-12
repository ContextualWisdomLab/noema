import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("protected external JSON cancellation-liveness documentation authority", () => {
  it("records protected #668 without promoting release or foreign authority", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");
    const changelog = readFileSync("CHANGELOG.md", "utf8");
    const source = readFileSync("src/index.ts", "utf8");

    expect(baseline).toContain(
      "merged PR #668 exact `efaaebae161a71b1274f5aa0f26e27376a3edb3a`",
    );
    expect(baseline).toContain("Protected #668 closes the external OIDC/GitHub JSON response cancellation-liveness gap");
    expect(baseline).toContain("immutable release and deployed heap/p95 evidence remain separate");
    const lifecycleStart = baseline.indexOf("Protected #654,");
    const lifecycleEnd = baseline.indexOf("\n## ", lifecycleStart);
    const lifecycleSection = baseline.slice(lifecycleStart, lifecycleEnd);
    expect(lifecycleSection).toContain("#668 does not transfer OIDC/GitHub identity");
    expect(changelog).toContain("PR #668.");

    expect(source).toContain("const ignoreCancellationFailure = () => undefined;");
    expect(source).toContain("const cancelReaderBestEffort = () => {");
    expect(source.match(/reader\.cancel\(\)\.catch\(ignoreCancellationFailure\)/g)).toHaveLength(1);
    expect(source.match(/cancelReaderBestEffort\(\);/g)).toHaveLength(2);
    expect(source).not.toContain("await reader.cancel();");
  });
});
