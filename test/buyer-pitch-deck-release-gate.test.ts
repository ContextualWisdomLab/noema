import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("buyer pitch deck release gate", () => {
  it("documents acquisition integrity as part of release verification", () => {
    const document = readFileSync(
      resolve(process.cwd(), "docs/buyer-pitch-deck-outline.md"),
      "utf8",
    );
    const releaseGate = document
      .split("\n")
      .find((line) => line.startsWith("- `npm run release:verify`:"));

    expect(releaseGate).toBeDefined();
    expect(releaseGate).toContain("data-room manifest");
    expect(releaseGate).toContain("acquisition integrity");
  });
});
