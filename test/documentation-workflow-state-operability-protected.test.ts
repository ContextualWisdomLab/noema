import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("protected Workflow / Task operability documentation authority", () => {
  it("classifies merged #605 as source-only exact-object observation", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(baseline).toContain(
      "Protected Workflow / Task operability source — issue #541 / merged PR #605",
    );
    expect(baseline).toContain(
      "PR #605 exact `b4fd8abb77a69847655e04a03fa63a72ea6d56b4`",
    );
    expect(baseline).toContain(
      "Resulting protected merge는 GitHub-verified `98942c88c228c18d44808db1c29bd8f165aa4167`",
    );
    expect(baseline).toContain("`read_operability`");
    expect(baseline).toContain("`{ database_size_bytes }`");
    expect(baseline).toContain("ADR 0013은 `Proposed`");
    expect(baseline).toContain(
      "Source-level exact-object observation은 deployed Durable Object transaction/restart/recovery, representative storage-growth denominator, synchronous-path p95, PITR/rollback 또는 immutable release evidence가 아니다.",
    );
    expect(baseline).not.toContain("Draft #605");
    expect(baseline).not.toContain("candidate #605");
  });
});
