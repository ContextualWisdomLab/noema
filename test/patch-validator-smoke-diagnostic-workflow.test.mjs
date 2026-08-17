import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { readPatchValidatorDiagnostic } from "../scripts/lib/patch-validator-smoke-diagnostic.mjs";

describe("patch-validator smoke diagnostic workflow", () => {
  it("retains only the bounded sanitized diagnostic that the workflow already uploads", () => {
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
      '"$IMAGE_TAG" >/dev/null 2>"$diagnostic_path"',
    );
    expect(workflow).not.toContain("docker cp ");
    expect(workflow).toContain("readPatchValidatorDiagnostic");
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

    const runnerTemp = mkdtempSync(join(tmpdir(), "noema-smoke-workflow-"));
    const diagnosticPath = join(
      runnerTemp,
      "patch-validator-untrusted-diagnostic.json",
    );
    const evidencePath = join(
      runnerTemp,
      "patch-validator-evidence",
      "smoke-diagnostic.json",
    );
    const previousRunnerTemp = process.env.RUNNER_TEMP;
    process.env.RUNNER_TEMP = runnerTemp;

    try {
      writeFileSync(
        diagnosticPath,
        JSON.stringify({
          status: "failed",
          exit_code: 2,
          stderr_excerpt: "typecheck failed\u0007",
          reason_codes: ["command_failed"],
          repository_full_name: "attacker/controlled",
        }),
      );

      expect(readPatchValidatorDiagnostic(diagnosticPath)).toEqual({
        trusted: false,
        status: "failed",
        exit_code: 2,
        stderr_excerpt: "typecheck failed",
        reason_codes: ["command_failed"],
      });
      expect(JSON.parse(readFileSync(evidencePath, "utf8"))).toEqual({
        trusted: false,
        status: "failed",
        exit_code: 2,
        stderr_excerpt: "typecheck failed",
        reason_codes: ["command_failed"],
      });
    } finally {
      if (previousRunnerTemp === undefined) {
        delete process.env.RUNNER_TEMP;
      } else {
        process.env.RUNNER_TEMP = previousRunnerTemp;
      }
      rmSync(runnerTemp, { recursive: true, force: true });
    }
  });
});
