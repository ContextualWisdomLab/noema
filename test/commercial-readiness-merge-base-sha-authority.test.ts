import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("commercial readiness merge base-SHA authority", () => {
  it("revalidates the freshly evaluated base SHA immediately before a merge write", () => {
    const script = readFileSync("scripts/hourly-commercial-readiness.mjs", "utf8");

    expect(script).toContain("baseSha,");
    expect(script).toContain(
      "function assertLiveHead(repository, pullNumber, expectedHeadSha, expectedBaseSha = null)",
    );
    expect(script).toContain(
      "expectedBaseSha !== null && live?.base?.sha !== expectedBaseSha",
    );
    expect(script).toContain(
      "assertLiveHead(repository, snapshot.number, expectedHeadSha, freshSnapshot.baseSha)",
    );
  });
});
