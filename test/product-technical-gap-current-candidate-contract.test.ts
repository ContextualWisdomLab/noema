import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("product technical gap current candidate authority", () => {
  it("tracks protected truth and separates moving-stack observations from merge authority", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(baseline).toContain(
      "main@5cd6341866a53351ff412415f677ec2fef23ea33",
    );
    expect(baseline).toContain(
      "merged PR #543 exact `b14b37ca12b3b6ae1999d250a393997ffff04dec`",
    );
    expect(baseline).toContain(
      "PR #536 exact `4fe6fe84611dfa1d69d8e0712b72b278429524d0`",
    );
    expect(baseline).toContain(
      "PR #535 exact `329069405181921091397d31687f2c5f7a98ae54`",
    );
    expect(baseline).toContain(
      "observed PR #556 exact `5121e1e0e445da8f5c80674c42b17d090caaeff4`",
    );
    expect(baseline).toContain(
      "live #556 must be re-fetched before integration",
    );
    expect(baseline).toContain(
      "PR #542 exact `6cb43c1b45747f000ee176212cbd00f5ee518396`",
    );
    expect(baseline).toContain(
      "PR #550 exact `289fbb002c8e8fb0fcb3ee947901574fc7c3fd88`",
    );
    expect(baseline).toContain(
      "PR #553 exact `4c92578c7b4cd41f74513cee1b2b2e470d09a20c`",
    );
    expect(baseline).toContain("behind_by=0");
    expect(baseline).toContain("predecessor GREEN");
  });
});
