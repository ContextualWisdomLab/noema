import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("documentation workflow and concurrency authority", () => {
  it("keeps nonterminal checks and concurrent branch movement non-authorizing", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    for (const state of ["queued", "pending", "in_progress", "skipped", "cancelled"]) {
      expect(baseline).toContain(state);
    }
    expect(baseline).toContain("Every source mutation/restack invalidates predecessor workflow evidence");
    expect(baseline).toContain("Concurrent commits/pushes are not races by themselves");
    expect(baseline).toContain(
      "ordinary-forward/non-force rather than by force push, destructive rebase, self-approval or gate weakening",
    );
    expect(baseline).toContain(
      "A blocked lane blocks only itself; unrelated safe review, owner-path repair, docs-to-code repair and buyer-gap work continue",
    );
  });
});
