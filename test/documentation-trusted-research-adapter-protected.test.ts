import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("protected trusted-research adapter documentation authority", () => {
  it("classifies #607 as protected source without promoting foreign producer authority", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(baseline).toMatch(/Dated protected observation for this repair는 `main@[0-9a-f]{40}`/u);
    expect(baseline).toContain(
      "merged PR #607 exact `0afd68d2e33b7fd9be2307ba78b370b534cc0f54`",
    );
    expect(baseline).toContain(
      "#607의 `trusted-research-retrieval@v1` byte-integrity adapter는 protected source다.",
    );
    expect(baseline).toContain(
      "live trusted retrieval producer/handoff는 `ContextualWisdomLab/.github#2087` owner path의 별도 prerequisite다.",
    );
    expect(baseline).toContain(
      "execution framing은 `ContextualWisdomLab/.github#2086` owner path의 별도 prerequisite다.",
    );
    expect(baseline).toContain(
      "`#2086` immutable execution framing + `#2087` immutable trusted retrieval producer",
    );
    expect(baseline).toContain("immutable Noema release");
    expect(baseline).toContain("released central consumer");

    expect(baseline).not.toContain("trusted adapter source implemented; live producer/wiring/release/consumer open");
    expect(baseline).not.toContain("This revision adds a `trusted-research-retrieval@v1` anti-corruption adapter");
    expect(baseline).not.toContain("Draft #607");
  });
});
