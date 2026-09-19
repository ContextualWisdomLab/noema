import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const ciWorkflowPath = ".github/workflows/ci.yml";
const retiredLockfileWorkflowPath = ".github/workflows/lockfile-reproducibility.yml";
const validatorWorkflowPath = ".github/workflows/patch-validator-image.yml";

function readWorkflow(path: string): string {
  return readFileSync(path, "utf8");
}

describe("Cloudflare toolchain lockfile and validator isolation", () => {
  it("keeps canonical lockfile regeneration on the established application CI identity", () => {
    const workflow = readWorkflow(ciWorkflowPath);

    expect(workflow).toContain("name: ci");
    expect(workflow).toContain("npm install");
    expect(workflow).toContain("--package-lock-only");
    expect(workflow).toContain("cmp --silent package-lock.json");
    expect(workflow).toContain("npm ci");
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).toContain("upload regenerated lockfile evidence");
    expect(workflow).toContain(
      "test \"$(git rev-parse HEAD)\" = \"$NOEMA_EXPECTED_HEAD_SHA\"",
    );
    expect(existsSync(retiredLockfileWorkflowPath)).toBe(false);
  });

  it("uploads regeneration evidence only after an eligible non-cancelled regeneration attempt", () => {
    const workflow = readWorkflow(ciWorkflowPath);
    const uploadStep = workflow.slice(
      workflow.indexOf("- name: upload regenerated lockfile evidence"),
      workflow.indexOf("- name: require committed lockfile reproducibility"),
    );

    expect(uploadStep).toContain(
      "if: !cancelled() && steps.regenerate_lockfile.outcome != 'skipped'",
    );
    expect(uploadStep).not.toContain("if: always()");
    expect(uploadStep).toContain("if-no-files-found: error");
  });

  it("prunes builder-only workerd and esbuild from patch-validator dependencies", () => {
    const workflow = readWorkflow(validatorWorkflowPath);

    expect(workflow).toContain("devDependencies.workerd");
    expect(workflow).toContain("devDependencies.esbuild");
    expect(workflow).toContain("test ! -e node_modules/workerd");
    expect(workflow).toContain("test ! -e node_modules/esbuild");
    expect(workflow).toContain("test ! -e node_modules/@esbuild");
    expect(workflow).toContain("test ! -e node_modules/miniflare");
  });
});