import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/reviewer-ci.yml", "utf8");

describe("reviewer CI action runtime integrity", () => {
  it("uses immutable Node 24-native GitHub actions", () => {
    expect(workflow).toContain(
      "uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1",
    );
    expect(workflow).toContain(
      "uses: actions/setup-python@5fda3b95a4ea91299a34e894583c3862153e4b97 # v7.0.0",
    );
    expect(workflow).not.toContain(
      "actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683",
    );
    expect(workflow).not.toContain(
      "actions/setup-python@a26af69be951a213d495a4c3e4e4022e16d87065",
    );
  });
});
