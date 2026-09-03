import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const lockfileWorkflowPath = ".github/workflows/lockfile-reproducibility.yml";
const validatorWorkflowPath = ".github/workflows/patch-validator-image.yml";

function readWorkflow(path: string): string {
  return readFileSync(path, "utf8");
}

describe("Cloudflare toolchain lockfile and validator isolation", () => {
  it("regenerates the canonical lock in isolation before comparing and installing it", () => {
    const workflow = readWorkflow(lockfileWorkflowPath);
    const jobsStart = workflow.indexOf("\njobs:");

    expect(jobsStart).toBeGreaterThan(0);
    expect(workflow.slice(0, jobsStart)).toContain(
      "permissions:\n  contents: read",
    );
    expect(workflow).toContain("npm install");
    expect(workflow).toContain("--package-lock-only");
    expect(workflow).toContain("cmp --silent package-lock.json");
    expect(workflow).toContain("npm ci");
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).toContain("upload regenerated lockfile evidence");
    expect(workflow).toContain(
      "test \"$(git rev-parse HEAD)\" = \"$NOEMA_EXPECTED_HEAD_SHA\"",
    );
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