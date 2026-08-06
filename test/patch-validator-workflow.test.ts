import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const workflowPath = ".github/workflows/patch-validator-image.yml";
const verifierPath = "scripts/verify-patch-validator-image.mjs";
const verifierLibraryPath = "scripts/lib/patch-validator-image-receipts.mjs";
const dockerfilePath = "Dockerfile.patch-validator";
const dockerfileFrontend =
  "# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e";

function readRequiredFile(path: string): string {
  expect(existsSync(path), `${path} must exist`).toBe(true);
  return readFileSync(path, "utf8");
}

describe("patch-validator pull-request image verification", () => {
  it("builds and verifies every exact PR head without publication authority", () => {
    const workflow = readRequiredFile(workflowPath);

    expect(workflow).toContain("name: patch-validator-image");
    const pullRequestStart = workflow.indexOf("  pull_request:");
    const workflowDispatchStart = workflow.indexOf("  workflow_dispatch:");
    expect(pullRequestStart).toBeGreaterThanOrEqual(0);
    expect(workflowDispatchStart).toBeGreaterThan(pullRequestStart);
    expect(
      workflow.slice(pullRequestStart, workflowDispatchStart).trim(),
    ).toBe("pull_request:");
    expect(workflow).toContain("permissions:\n  contents: read");
    expect(workflow).not.toContain("contents: write");
    expect(workflow).not.toContain("packages: write");
    expect(workflow).not.toContain("id-token: write");
    expect(workflow).not.toContain("attestations: write");
    expect(workflow).not.toContain("artifact-metadata: write");

    expect(workflow).toContain(
      "SOURCE_SHA: ${{ github.event.pull_request.head.sha || github.sha }}",
    );
    expect(workflow).toContain(
      "PR_NUMBER: ${{ github.event.pull_request.number || '' }}",
    );
    expect(workflow).toContain("ref: ${{ env.SOURCE_SHA }}");
    expect(workflow).toContain("Refuse stale pull-request head before verification");
    expect(workflow).toContain("Refuse stale pull-request head after verification");
    expect(workflow).toContain(
      'gh api --method GET "repos/${GITHUB_REPOSITORY}/pulls/${PR_NUMBER}" --jq ".head.sha"',
    );
    expect(workflow.match(/test "\$live_head" = "\$SOURCE_SHA"/g)).toHaveLength(2);
    expect(workflow).toContain("GH_TOKEN: ${{ github.token }}");
    expect(workflow).toContain(
      "actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683",
    );
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).toContain(
      "sigstore/cosign-installer@6f9f17788090df1f26f669e9d70d6ae9567deba6",
    );
    expect(workflow).toContain(
      "aquasecurity/setup-trivy@81e514348e19b6112ce2a7e3ecbafe19c1e1f567",
    );
    expect(workflow).toContain("version: v0.73.0");
    expect(workflow).toContain(
      "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
    );

    expect(workflow).toContain("cosign verify");
    expect(workflow).toContain("--certificate-oidc-issuer=https://accounts.google.com");
    expect(workflow).toContain(
      "--certificate-identity=keyless@distroless.iam.gserviceaccount.com",
    );
    expect(workflow).toContain("docker build");
    expect(workflow).toContain("--platform=linux/amd64");
    expect(workflow).toContain("--file=Dockerfile.patch-validator");
    expect(workflow).toContain("--build-arg=SOURCE_REVISION=${SOURCE_SHA}");

    for (const hardeningFlag of [
      "--network=none",
      "--read-only",
      "--cap-drop=ALL",
      "--security-opt=no-new-privileges=true",
      "--pids-limit=256",
      "--memory=2g",
      "--memory-swap=2g",
      "--cpus=2",
      "--ipc=none",
      "--ulimit=nofile=1024:1024",
      "--ulimit=nproc=256:256",
      "--ulimit=core=0:0",
      "--tmpfs=/workspace:",
      "--tmpfs=/tmp:",
    ]) {
      expect(workflow).toContain(hardeningFlag);
    }
    expect(workflow).toContain("dst=/input,readonly");
    expect(workflow).toContain("dst=/patch/input.patch,readonly");
    expect(workflow).toContain("dst=/output/result.json");

    expect(workflow).toContain("--format cyclonedx");
    expect(workflow).toContain("--severity MEDIUM,HIGH,CRITICAL");
    expect(workflow).toContain("--exit-code 1");
    expect(workflow).toContain("node scripts/verify-patch-validator-image.mjs");
    expect(workflow).toContain("retention-days: 90");

    expect(workflow).not.toContain("docker push");
    expect(workflow).not.toContain("docker/login-action");
    expect(workflow).not.toContain("cosign sign");
    expect(workflow).not.toContain("actions/attest");
    expect(workflow).not.toContain("NVIDIA_NIM_API_KEY");
    expect(workflow.toLowerCase()).not.toContain("copilot");
  });

  it("pins the Dockerfile frontend by immutable digest", () => {
    const dockerfile = readRequiredFile(dockerfilePath);
    expect(dockerfile.split("\n", 1)[0]).toBe(dockerfileFrontend);
  });

  it("ships a bounded verifier covered by the root test gate", () => {
    const verifier = readRequiredFile(verifierPath);
    const verifierLibrary = readRequiredFile(verifierLibraryPath);
    const vitest = readRequiredFile("vitest.config.ts");
    const packageJson = JSON.parse(readRequiredFile("package.json")) as {
      scripts?: Record<string, string>;
    };

    expect(verifier).toContain("verifyPatchValidatorReceipts");
    expect(verifierLibrary).toContain(
      "export function verifyPatchValidatorReceipts",
    );
    expect(verifierLibrary).toContain("MAX_RECEIPT_BYTES");
    expect(verifierLibrary).toContain("CycloneDX");
    expect(verifierLibrary).toContain("validator_image_digest");
    expect(verifierLibrary).toContain("source_revision");
    expect(vitest).toContain(
      '"scripts/lib/patch-validator-image-receipts.mjs"',
    );
    expect(packageJson.scripts?.["patch-validator:image:verify-receipts"]).toBe(
      "node scripts/verify-patch-validator-image.mjs",
    );
  });
});
