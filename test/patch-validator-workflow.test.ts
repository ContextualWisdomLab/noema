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
    expect(workflow).toContain("timeout-minutes: 90");
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
      "aquasecurity/setup-trivy@81e514348e19b6112ce2a7e3ecbafe19c1e1f567",
    );
    expect(workflow).toContain("version: v0.73.0");
    expect(workflow).toContain(
      "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
    );

    expect(workflow).not.toContain("DISTROLESS_IMAGE");
    expect(workflow).not.toContain("sigstore/cosign-installer");
    expect(workflow).not.toContain("cosign verify");
    expect(workflow).not.toContain("keyless@distroless.iam.gserviceaccount.com");
    expect(workflow).toContain("docker build");
    expect(workflow).toContain("--platform=linux/amd64");
    expect(workflow).toContain("--file=Dockerfile.patch-validator");
    expect(workflow).toContain("--build-arg=SOURCE_REVISION=${SOURCE_SHA}");
    expect(workflow).toContain("Verify static Node runtime identity");
    expect(workflow).toContain(
      'test "$(docker run --rm --pull=never --entrypoint=/nodejs/bin/node "$IMAGE_TAG" --version)" = "v24.19.0"',
    );
    expect(workflow).toContain("readelf -l \"$node_binary\"");
    expect(workflow).toContain("readelf -d \"$node_binary\"");
    expect(workflow).toContain("grep -Eq '\\.(node|so)(\\.|$)'");
    expect(workflow).not.toContain("(?:");
    expect(workflow).toContain("contains a native addon or shared library");

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
    expect(workflow).not.toContain("dst=/output/result.json");
    expect(workflow).toContain("--env=NOEMA_RESULT_PATH=/workspace/result.json");
    expect(workflow).toContain(
      'diagnostic_path="$RUNNER_TEMP/patch-validator-untrusted-diagnostic.json"',
    );
    expect(workflow).toContain('"$IMAGE_TAG" >/dev/null 2>"$diagnostic_path"');
    expect(workflow).not.toContain(
      'docker cp "$container_name:/workspace/result.json" "$diagnostic_path"',
    );
    expect(workflow).not.toContain('"$IMAGE_TAG" >/dev/null 2>&1');
    expect(workflow).toContain("const smokeResult = {");
    expect(workflow).toContain('flag: "wx"');
    expect(workflow).toContain(
      "printf 'SOURCE_TSCONFIG_MUST_NOT_BE_PARSED\\n' >\"$source_dir/tsconfig.json\"",
    );
    expect(workflow).toContain(
      'throw new Error("source Vitest config must not execute");',
    );

    expect(workflow).toContain("--format cyclonedx");
    expect(workflow).toContain("--severity MEDIUM,HIGH,CRITICAL");
    expect(workflow).toContain("--exit-code 1");
    expect(workflow).toContain("node scripts/verify-patch-validator-image.mjs");
    expect(workflow).toContain(
      '--vulnerability-scan "$evidence_dir/image-vulnerability-scan.json"',
    );
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
    expect(verifier).toContain('"--vulnerability-scan"');
    expect(verifierLibrary).toContain(
      "export function verifyPatchValidatorReceipts",
    );
    expect(verifierLibrary).toContain("MAX_RECEIPT_BYTES");
    expect(verifierLibrary).toContain("CycloneDX");
    expect(verifierLibrary).toContain("vulnerabilityScan");
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
