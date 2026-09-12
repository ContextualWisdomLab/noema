import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("protected orchestrator health reader-acquisition documentation authority", () => {
  it("records protected #695 without promoting release or orchestrator authority", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");
    const changelog = readFileSync("CHANGELOG.md", "utf8");
    const source = readFileSync("scripts/lib/orchestrator-gateway.mjs", "utf8");

    expect(baseline).toContain(
      "merged PR #695 exact `c9d526093e543167645383e937096fd089b337f8`",
    );
    expect(baseline).toContain(
      "Protected #695 closes the contextual-orchestrator health response reader-acquisition gap",
    );
    expect(baseline).toContain(
      "#695 remains protected source evidence; immutable release and deployed availability/p95/recovery evidence remain separate",
    );
    expect(baseline).toContain(
      "#695 does not transfer contextual-orchestrator service, provider/model routing, credential, outbound, quarantine/security, release/deployment, or foreign domain authority to Noema",
    );
    expect(changelog).toContain(
      "Protected #695 normalizes synchronous reader acquisition on the contextual-orchestrator `/healthz` response consumer at exact source `c9d526093e543167645383e937096fd089b337f8`",
    );
    expect(changelog).toContain("PR #695.");

    // Documentation convergence must not rewrite unrelated protected history.
    expect(changelog).toContain(
      "Distributed `/exchange` rate-limit의 private Durable Object request(256 bytes)와 decision response(4,096 bytes) bounded stream reader",
    );
    expect(baseline).toContain(
      "Cross-service SQL과 mutable sibling PR dependency는 금지한다.\n\nProtected #681 exact",
    );
    expect(baseline).toContain(
      "historical Git lineage에 남아 있다.\n\nProtected source는 durable append-only lifecycle evidence의 prerequisite",
    );

    expect(source).toContain(
      '\"contextual-orchestrator health response body is not stream-readable\"',
    );
    expect(source).toContain("HEALTH_BODY_LIMIT_BYTES = 65_536");
    expect(source).toContain("void reader.cancel().catch(() => undefined);");
  });
});
