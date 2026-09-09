import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  ".github/workflows/patch-validator-image.yml",
  "utf8",
);

describe("patch-validator image build cache", () => {
  it("uses an authenticated GitHub Actions cache transport for successive exact PR heads", () => {
    expect(workflow).toContain(
      "uses: docker/build-push-action@d08e5c354a6adb9ed34480a06d141179aa583294",
    );
    expect(workflow).toContain("load: true");
    expect(workflow).toContain(
      "cache-from: type=gha,scope=noema-patch-validator-image",
    );
    expect(workflow).toContain(
      "cache-to: type=gha,mode=max,scope=noema-patch-validator-image",
    );
    expect(workflow).toContain("build-contexts: |");
    expect(workflow).toContain(
      "validator_deps=${{ env.VALIDATOR_DEPS_CONTEXT }}",
    );
    expect(workflow).toContain("SOURCE_REVISION=${{ env.SOURCE_SHA }}");
    expect(workflow).toContain("tags: ${{ env.IMAGE_TAG }}");
    expect(workflow).not.toContain("docker buildx build");
  });

  it("seeds the shared BuildKit cache from protected main for sibling PR branches", () => {
    expect(workflow).toMatch(/push:\s*\n\s*branches:\s*\n\s*- main/);
    expect(workflow).toContain("workflow_dispatch:");
  });

  it("limits protected-main cache seeding to image-authority changes", () => {
    expect(workflow).toMatch(
      /push:\s*\n\s*branches:\s*\n\s*- main\s*\n\s*paths:/,
    );
    for (const path of [
      '      - ".github/workflows/patch-validator-image.yml"',
      '      - "Dockerfile.patch-validator"',
      '      - "package.json"',
      '      - "package-lock.json"',
      '      - "patch-validator/**"',
      '      - "scripts/lib/patch-validator-*.mjs"',
      '      - "scripts/verify-patch-validator-image.mjs"',
    ]) {
      expect(workflow).toContain(path);
    }
  });

  it("cancels only superseded pull-request builds while preserving non-PR runs", () => {
    expect(workflow).toContain(
      "group: ${{ github.workflow }}-${{ github.repository }}-${{ github.event_name == 'pull_request' && github.event.pull_request.number || github.run_id }}",
    );
    expect(workflow).toContain(
      "cancel-in-progress: ${{ github.event_name == 'pull_request' }}",
    );
  });

  it("retries transient scanner release download failures before failing closed", () => {
    expect(workflow).toContain("download_scanner_asset() {");
    expect(workflow).toContain("--retry 3");
    expect(workflow).toContain("--retry-all-errors");
    expect(workflow).toContain("--retry-delay 2");
    expect(workflow).toContain("--retry-max-time 90");
  });
});
