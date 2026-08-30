import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const repository = "ContextualWisdomLab/noema";
const commitSha = "a".repeat(40);
const version = "0.1.0";
const tag = `v${version}`;
const missingPath = "test/fixtures/does-not-exist-release-publication-evidence.json";

function runReceipt(overrides: Record<string, string>) {
  return spawnSync(
    process.execPath,
    [
      "scripts/release-publication-receipt.mjs",
      "--policy",
      missingPath,
      "--release-view",
      missingPath,
      "--release-api",
      missingPath,
      "--verification",
      missingPath,
      "--release-evidence",
      missingPath,
      "--asset-dir",
      "test/fixtures",
      "--output",
      "test/fixtures/does-not-exist-release-publication-receipt.json",
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        GITHUB_REPOSITORY: repository,
        GITHUB_SHA: commitSha,
        NOEMA_RELEASE_TAG: tag,
        NOEMA_RELEASE_COMMIT_SHA: commitSha,
        NOEMA_RELEASE_VERSION: version,
        NOEMA_RELEASE_GENERATED_AT: "2026-08-03T14:00:01.000Z",
        ...overrides,
      },
      encoding: "utf8",
    },
  );
}

describe("release publication explicit identity overrides", () => {
  it.each([
    ["NOEMA_RELEASE_COMMIT_SHA", { NOEMA_RELEASE_COMMIT_SHA: "" }],
    ["NOEMA_RELEASE_GENERATED_AT", { NOEMA_RELEASE_GENERATED_AT: "" }],
  ])("fails closed when %s is explicitly present but empty", (_label, overrides) => {
    const result = runReceipt(overrides);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("must be a non-empty string");
    expect(result.stderr).not.toContain("could not be read safely");
  });
});
