import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  ".github/workflows/hourly-product-development.yml",
  "utf8",
);

function sliceBetween(startMarker: string, endMarker: string): string {
  const start = workflow.indexOf(startMarker);
  const end = workflow.indexOf(endMarker, start + startMarker.length);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return workflow.slice(start, end);
}

describe("NVIDIA NIM proposer shell isolation", () => {
  it("denies shell execution in the credential-bearing OpenCode policy", () => {
    const config = sliceBetween(
      "      - name: Configure OpenCode for NVIDIA NIM only",
      "      - name: Run bounded NVIDIA NIM model fallback",
    );

    expect(config).toContain('"bash": "deny"');
    expect(config).not.toContain('"bash": {');
    expect(config).not.toContain('"*": "allow",\n                "curl *"');
  });

  it("requires exact verifier instructions without granting proposer execution authority", () => {
    const prompt = sliceBetween(
      "      - name: Prepare bounded commercial-quality task",
      "      - name: Record dry-run task contract",
    );

    expect(prompt).toContain(
      "The credential-bearing proposer has no shell execution authority.",
    );
    expect(prompt).toContain(
      "A separate uncredentialed verifier will execute the proposal on a fresh runner.",
    );
    expect(prompt).toContain(
      "The separate uncredentialed verifier must execute `npm run release:verify`",
    );
    expect(prompt).toContain(
      "Do not execute that command or claim its result in the credential-bearing proposer.",
    );
    expect(prompt).not.toContain("run it, and record the expected failure");
    expect(prompt).not.toContain("Run focused tests and npm run release:verify");
    expect(prompt).not.toContain("complete verification commands and\n          results");
  });

  it("never executes proposed repository code on the credential-bearing proposer runner", () => {
    const proposer = sliceBetween(
      "  propose_product_increment:",
      "  package_product_increment:",
    );
    const releaseVerifyCommands = workflow.match(
      /^\s+npm run release:verify\s*$/gm,
    ) ?? [];

    expect(proposer).toContain(
      "      - name: Bound and export proposal without executing it",
    );
    expect(proposer).not.toContain(
      "      - name: Verify, bound, and export the uncredentialed proposal",
    );
    expect(proposer).not.toMatch(/^\s+npm run /m);
    expect(releaseVerifyCommands).toHaveLength(1);
  });

  it("retains executable verification in the fresh uncredentialed job", () => {
    const verifier = sliceBetween(
      "  package_product_increment:",
      "  publish_product_increment:",
    );

    expect(verifier).toContain(
      "Re-run complete release verification on the fresh runner",
    );
    expect(verifier).toContain("npm run release:verify");
    expect(verifier).not.toContain("NVIDIA_API_KEY");
    expect(verifier).not.toContain("NOEMA_MAINTAINER_APP_PRIVATE_KEY");
  });
});
