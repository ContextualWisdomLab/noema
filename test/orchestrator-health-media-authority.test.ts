import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  orchestratorGatewayConsumerContract,
  serializeOrchestratorGatewayConsumerContract,
} from "../scripts/lib/orchestrator-gateway.mjs";

describe("protected orchestrator health media-type documentation authority", () => {
  it("records protected #697 and publishes the JSON health media contract without promoting foreign authority", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");
    const changelog = readFileSync("CHANGELOG.md", "utf8");
    const narrative = readFileSync(
      "docs/orchestrator-gateway-consumer-contract.md",
      "utf8",
    );
    const published = readFileSync("contracts/orchestrator-gateway.json", "utf8");
    const source = readFileSync("scripts/lib/orchestrator-gateway.mjs", "utf8");
    const contract = orchestratorGatewayConsumerContract();

    expect(baseline).toContain(
      "merged PR #697 exact `1e0ac2eac6d3172468c842cae957079305c33a1d`",
    );
    expect(baseline).toContain(
      "Protected #697 closes the contextual-orchestrator health media-type admission gap",
    );
    expect(baseline).toContain(
      "#697 remains protected source evidence; immutable release and deployed availability/p95/recovery evidence remain separate",
    );
    expect(baseline).toContain(
      "#697 does not transfer contextual-orchestrator service, provider/model routing, credential, outbound, quarantine/security, release/deployment, or foreign domain authority to Noema",
    );

    expect(changelog).toContain(
      "Protected #697 requires `application/json` on successful contextual-orchestrator `/healthz` responses at exact source `1e0ac2eac6d3172468c842cae957079305c33a1d`",
    );
    expect(changelog).toContain("PR #697.");

    expect(contract.healthz.media_type).toBe("application/json");
    expect(published).toBe(serializeOrchestratorGatewayConsumerContract());
    expect(narrative).toContain("`Content-Type: application/json`");

    expect(source).toContain(
      '"contextual-orchestrator health response content-type is not application/json"',
    );
    expect(source).toContain("HEALTH_BODY_LIMIT_BYTES = 65_536");

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
  });
});
