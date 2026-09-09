import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/patch-validator-image.yml", "utf8");

describe("patch-validator image build timeout", () => {
  it("preserves the explicit 150-minute build deadline after cache transport repair", () => {
    const buildStepStart = workflow.indexOf(
      "- name: Build exact-head patch-validator image with authenticated GitHub Actions cache",
    );
    const digestStepStart = workflow.indexOf(
      "- name: Capture exact-head patch-validator image digest",
      buildStepStart,
    );

    expect(buildStepStart).toBeGreaterThanOrEqual(0);
    expect(digestStepStart).toBeGreaterThan(buildStepStart);

    const buildStep = workflow.slice(buildStepStart, digestStepStart);
    expect(buildStep).toContain("timeout-minutes: 150");
  });
});
