import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/release-evidence.yml", "utf8");

function stepIndex(name: string): number {
  return workflow.indexOf(`      - name: ${name}`);
}

describe("release evidence dependency-install integrity", () => {
  it("revalidates tracked and unexpected untracked release source after npm lifecycle execution", () => {
    const installIndex = stepIndex("Install lockfile dependencies");
    const integrityIndex = stepIndex("Verify tracked release source unchanged after install");
    const verifyIndex = stepIndex("Verify release quality");

    expect(installIndex).toBeGreaterThan(-1);
    expect(integrityIndex).toBeGreaterThan(installIndex);
    expect(verifyIndex).toBeGreaterThan(integrityIndex);

    const integrityBlock = workflow.slice(integrityIndex, verifyIndex);
    expect(integrityBlock).toContain("git status --porcelain=v1 --untracked-files=all");
    expect(integrityBlock).not.toContain("--untracked-files=no");
    expect(integrityBlock).toContain('git rev-parse HEAD');
    expect(integrityBlock).toContain('steps.identity.outputs.commit_sha');
  });
});
