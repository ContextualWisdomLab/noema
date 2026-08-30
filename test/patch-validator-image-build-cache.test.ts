import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  ".github/workflows/patch-validator-image.yml",
  "utf8",
);

describe("patch-validator image build cache", () => {
  it("reuses content-addressed BuildKit layers across successive exact PR heads", () => {
    expect(workflow).toContain("docker buildx build");
    expect(workflow).toContain("--load");
    expect(workflow).toContain(
      "--cache-from=type=gha,scope=noema-patch-validator-image",
    );
    expect(workflow).toContain(
      "--cache-to=type=gha,mode=max,scope=noema-patch-validator-image",
    );
    expect(workflow).not.toContain(
      "timeout --signal=TERM --kill-after=30s 150m docker build \\",
    );
  });

  it("cancels superseded exact-head builds instead of spending the serial image lane on stale evidence", () => {
    expect(workflow).toContain(
      "group: noema-patch-validator-image-${{ github.event.pull_request.number || github.ref }}",
    );
    expect(workflow).toContain("cancel-in-progress: true");
  });

  it("retries transient scanner release download failures before failing closed", () => {
    expect(workflow).toContain("download_scanner_asset() {");
    expect(workflow).toContain("--retry 3");
    expect(workflow).toContain("--retry-all-errors");
    expect(workflow).toContain("--retry-delay 2");
    expect(workflow).toContain("--retry-max-time 90");
  });
});
