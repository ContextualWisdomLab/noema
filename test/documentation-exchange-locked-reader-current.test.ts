import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const changelog = readFileSync("CHANGELOG.md", "utf8");
const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

describe("#689 exchange locked-reader documentation authority", () => {
  it("keeps the protected source lineage and stable public failure contract current", () => {
    expect(changelog).toContain(
      "#689 normalizes reader acquisition on the public `/exchange` bounded JSON request body",
    );
    expect(changelog).toContain(
      "`b838c352a7cd0f7f58a905857537a3a9675a56f2`",
    );
    expect(baseline).toContain(
      "merged PR #689 exact `b838c352a7cd0f7f58a905857537a3a9675a56f2`",
    );
    expect(baseline).toContain(
      "protected main `620b29fae9a5dad5d463aff83dd6adb6b67f9305`",
    );
    expect(baseline).toContain(
      "locked or otherwise non-stream-readable `/exchange` request body",
    );
    expect(baseline).toContain(
      "stable `400` / `ERR_VALIDATION_INPUT` / `unreadable` contract before credential egress",
    );
  });

  it("does not promote source integration into release or foreign-owner authority", () => {
    expect(baseline).toContain(
      "#689 source integration is not immutable release, production deployment, recovery rehearsal, or deployed p95/heap evidence",
    );
    expect(baseline).toContain(
      "#689 retains provider/model routing, destination/outbound policy, credential, quarantine/security, release/deployment, and foreign-domain authority with their existing owners",
    );
  });
});
