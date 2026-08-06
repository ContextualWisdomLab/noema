import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("patch-validator smoke diagnostic workflow", () => {
  it("copies private failure output only after execution and removes it after bounded reporting", () => {
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
      'docker cp "$container_name:/workspace/result.json" "$diagnostic_path"',
    );
    expect(workflow).toContain(
      "readPatchValidatorDiagnostic",
    );
    expect(workflow).toContain('rm -f "$diagnostic_path"');
    expect(workflow).not.toContain(
      "$RUNNER_TEMP/patch-validator-untrusted-diagnostic.json\n          path:",
    );
    expect(vitest).toContain(
      '"scripts/lib/patch-validator-smoke-diagnostic.mjs"',
    );
  });
});
