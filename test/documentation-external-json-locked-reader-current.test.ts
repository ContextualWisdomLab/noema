import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const changelog = readFileSync("CHANGELOG.md", "utf8");
const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

describe("#693 external JSON locked-reader documentation authority", () => {
  it("records the protected source and normal-merge lineage", () => {
    expect(changelog).toContain(
      "Protected #693 normalizes reader acquisition on the shared 65,536-byte external JSON response reader",
    );
    expect(changelog).toContain(
      "`c23a2bcf5e79eea5f095fb3516e28397899c87c9`",
    );
    expect(baseline).toContain(
      "merged PR #693 exact `c23a2bcf5e79eea5f095fb3516e28397899c87c9`",
    );
    expect(baseline).toContain(
      "#693의 GitHub-verified normal merge identity `ee5f8ffb5739dda2eea9b8078d177bd12356e1bc`",
    );
  });

  it("keeps transport failure classification distinct from malformed JSON and foreign authority", () => {
    expect(changelog).toContain(
      "GitHub OIDC discovery response body could not be read",
    );
    expect(changelog).toContain("GitHub OIDC JWKS response body could not be read");
    expect(changelog).toContain("GitHub API response body could not be read");
    expect(baseline).toContain(
      "65,536-byte ceiling, 10-second absolute deadline, fixed retained buffer",
    );
    expect(baseline).toContain(
      "#693 does not transfer OIDC/GitHub identity, provider/model routing, destination/outbound policy, credential authority, quarantine/security authority, release/deployment authority, or foreign domain truth to Noema.",
    );
    expect(baseline).toContain(
      "#693 remains protected source/test authority; immutable release, production deployment, recovery rehearsal, and deployed p95/heap evidence remain separate.",
    );
  });
});
