import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("documentation workflow and concurrency authority", () => {
  it("keeps nonterminal checks and concurrent branch movement non-authorizing", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    for (const state of ["queued", "pending", "in_progress", "skipped", "cancelled"]) {
      expect(baseline).toContain(state);
    }
    expect(baseline).toContain("Every source mutation/restack invalidates predecessor workflow evidence");
    expect(baseline).toContain("Concurrent commits나 pushes 자체를 race로 단정하지 않는다");
    expect(baseline).toContain("force push나 destructive rebase가 아니라 ordinary/non-force semantic convergence");
    expect(baseline).toContain("Blocked lane은 자기 lane만 막고 unrelated safe review");
  });
});
