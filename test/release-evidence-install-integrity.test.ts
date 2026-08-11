import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/release-evidence.yml", "utf8");

function stepIndex(name: string): number {
  return workflow.indexOf(`      - name: ${name}`);
}

function jobBlock(name: string, nextName: string): string {
  const startMarker = `  ${name}:\n`;
  const endMarker = `\n  ${nextName}:\n`;
  const start = workflow.indexOf(startMarker);
  expect(start).toBeGreaterThan(-1);
  const end = workflow.indexOf(endMarker, start + startMarker.length);
  expect(end).toBeGreaterThan(start);
  return workflow.slice(start, end);
}

describe("release evidence dependency-install integrity", () => {
  it("revalidates tracked release source after npm lifecycle execution", () => {
    const installIndex = stepIndex("Install lockfile dependencies");
    const integrityIndex = stepIndex("Verify tracked release source unchanged after install");
    const verifyIndex = stepIndex("Verify release quality");

    expect(installIndex).toBeGreaterThan(-1);
    expect(integrityIndex).toBeGreaterThan(installIndex);
    expect(verifyIndex).toBeGreaterThan(integrityIndex);

    const integrityBlock = workflow.slice(integrityIndex, verifyIndex);
    expect(integrityBlock).toContain("git status --porcelain=v1 --untracked-files=no");
    expect(integrityBlock).toContain('git rev-parse HEAD');
    expect(integrityBlock).toContain('steps.identity.outputs.commit_sha');
  });

  it("keeps dependency lifecycle execution outside the attestation authority plane", () => {
    const verifyJob = jobBlock("verify_release", "attest_release");
    const attestJob = jobBlock("attest_release", "publish_release");

    expect(verifyJob).toContain("permissions:\n      contents: read");
    expect(verifyJob).not.toContain("id-token: write");
    expect(verifyJob).not.toContain("attestations: write");
    expect(verifyJob).not.toContain("artifact-metadata: write");
    expect(verifyJob).toContain("- name: Install lockfile dependencies");
    expect(verifyJob).toContain("- name: Verify release quality");
    expect(verifyJob).toContain("verification-handoff.json");
    expect(verifyJob).toContain("verification-handoff.sha256");

    expect(attestJob).toContain("needs: verify_release");
    expect(attestJob).toContain("actions: read");
    expect(attestJob).toContain("id-token: write");
    expect(attestJob).toContain("attestations: write");
    expect(attestJob).toContain("artifact-metadata: write");
    expect(attestJob).not.toContain("npm ci");
    expect(attestJob).not.toContain("npm run release:verify");
    expect(attestJob).toContain("artifact-ids: ${{ needs.verify_release.outputs.artifact_id }}");
    expect(attestJob).toContain("EXPECTED_VERIFICATION_ARTIFACT_DIGEST");
    expect(attestJob).toContain("size_in_bytes");
    expect(attestJob).toContain("sha256sum --check verification-handoff.sha256");
    expect(attestJob).toContain(".schemaVersion == 1");
    expect(attestJob).toContain(".source.repository == $repo");
    expect(attestJob).toContain(".source.commitSha == $sha");
  });
});
