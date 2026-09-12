import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("protected Cloudflare response cancellation-liveness documentation authority", () => {
  it("records protected #665 without promoting provider or release authority", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");
    const changelog = readFileSync("CHANGELOG.md", "utf8");
    const source = readFileSync("scripts/lib/cloudflare-response.mjs", "utf8");

    expect(baseline).toContain(
      "merged PR #665 exact `592ae00f090f642e8cb71ffb132d4a8b7bfe993a`",
    );
    expect(baseline).toContain("Cloudflare control-plane response");
    expect(baseline).toContain("cancellation completion is best-effort cleanup");
    expect(baseline).toContain("1 MiB");
    expect(baseline).toContain("reader lock");
    expect(baseline).toContain("immutable release");
    expect(changelog).toContain("PR #665");
    expect(changelog).toContain("Cloudflare control-plane");
    expect(changelog).toMatch(/cancellation completion/i);
    expect(changelog).toContain("best-effort cleanup");
    expect(source).toMatch(
      /void reader\.cancel\("Cloudflare response byte ceiling exceeded"\)\.catch\(\(\) => undefined\)/,
    );
    expect(baseline).toContain(
      "#665 does not transfer Cloudflare/provider authority, destination/outbound policy, credential authority, quarantine/security authority, or foreign domain truth to Noema.",
    );
    expect(baseline).not.toContain("#665 proves production performance");
  });
});
