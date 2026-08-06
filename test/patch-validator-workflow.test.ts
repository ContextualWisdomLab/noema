import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const workflowPath = ".github/workflows/patch-validator-image.yml";
const verifierPath = "scripts/verify-patch-validator-image.mjs";

function readRequiredFile(path: string): string {
  expect(existsSync(path), `${path} must exist`).toBe(true);
  return readFileSync(path, "utf8");
}

describe("patch-validator pull-request image verification", () => {
  it("builds and verifies the exact image without any publication authority", () => {
    const workflow = readRequiredFile(workflowPath);

    expect(workflow).toContain("name: patch-validator-image");
    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("Dockerfile.patch-validator");
    expect(workflow).toContain("Dockerfile.patch-validator.dockerignore");
    expect(workflow).toContain("patch-validator/**");
    expect(workflow).toContain("reviewer/noema_reviewer/patch_image_validation.py");
    expect(workflow).toContain("permissions:\n  contents: read");
    expect(workflow).not.toContain("contents: write");
    expect(workflow).not.toContain("packages: write");
    expect(workflow).not.toContain("id-token: write");
    expect(workflow).not.toContain("attestations: write");
    expect(workflow).not.toContain("artifact-metadata: write");

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
    expect(workflow).toContain("--build-arg=SOURCE_REVISION=${GITHUB_SHA}");

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

  it("ships a bounded verifier covered by the root test gate", () => {
    const verifier = readRequiredFile(verifierPath);
    const vitest = readRequiredFile("vitest.config.ts");
    const packageJson = JSON.parse(readRequiredFile("package.json")) as {
      scripts?: Record<string, string>;
    };

    expect(verifier).toContain("export function verifyPatchValidatorReceipts");
    expect(verifier).toContain("MAX_RECEIPT_BYTES");
    expect(verifier).toContain("CycloneDX");
    expect(verifier).toContain("validator_image_digest");
    expect(verifier).toContain("source_revision");
    expect(vitest).toContain('"scripts/verify-patch-validator-image.mjs"');
    expect(packageJson.scripts?.["patch-validator:image:verify-receipts"]).toBe(
      "node scripts/verify-patch-validator-image.mjs",
    );
  });
});
