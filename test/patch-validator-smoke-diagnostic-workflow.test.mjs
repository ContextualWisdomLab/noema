import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("patch-validator smoke diagnostic workflow", () => {
  it("captures only bounded stderr diagnostics and removes them after reporting", () => {
    const workflow = readFileSync(
      ".github/workflows/patch-validator-image.yml",
      "utf8",
    );
    const vitest = readFileSync("vitest.config.ts", "utf8");

    expect(workflow).not.toContain("docker run --rm \\");
    expect(workflow).toContain(
      'container_name="noema-patch-smoke-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"',
    );
    expect(workflow).toContain('docker rm -f "$container_name"');
    expect(workflow).toContain(
      'diagnostic_path="$RUNNER_TEMP/patch-validator-untrusted-diagnostic.json"',
    );
    expect(workflow).toContain(
      'sanitized_diagnostic_path="$RUNNER_TEMP/patch-validator-evidence/smoke-diagnostic.json"',
    );
    expect(workflow).toContain(
      '"$IMAGE_TAG" >/dev/null 2>"$diagnostic_path"',
    );
    expect(workflow).not.toContain("docker cp ");
    expect(workflow).toContain("readPatchValidatorDiagnostic");
    expect(workflow).toContain(
      'DIAGNOSTIC_EVIDENCE_PATH="$sanitized_diagnostic_path"',
    );
    expect(workflow).toContain(
      "writeFileSync(process.env.DIAGNOSTIC_EVIDENCE_PATH",
    );
    expect(workflow).toContain('rm -f "$diagnostic_path"');
    expect(workflow).not.toContain(
      "$RUNNER_TEMP/patch-validator-untrusted-diagnostic.json\n          path:",
    );
    expect(workflow).toContain(
      "path: ${{ runner.temp }}/patch-validator-evidence",
    );
    expect(vitest).toContain(
      '"scripts/lib/patch-validator-smoke-diagnostic.mjs"',
    );
  });
});
