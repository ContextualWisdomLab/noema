import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const repository = "ContextualWisdomLab/noema";
const version = "0.1.0";
const tag = `v${version}`;
const missingPath = "test/fixtures/does-not-exist-release-publication-evidence.json";

function runReceipt(commitSha: string) {
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
        NOEMA_RELEASE_TAG: tag,
        NOEMA_RELEASE_COMMIT_SHA: commitSha,
        NOEMA_RELEASE_VERSION: version,
        NOEMA_RELEASE_GENERATED_AT: "2026-08-03T14:00:01.000Z",
      },
      encoding: "utf8",
    },
  );
}

describe("release publication exact commit identity", () => {
  it.each([
    "A".repeat(40),
    `${"a".repeat(39)}A`,
  ])("rejects noncanonical commit SHA %s before release evidence access", (commitSha) => {
    const result = runReceipt(commitSha);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "release commit SHA must be the canonical lowercase 40-character hexadecimal identity",
    );
    expect(result.stderr).not.toContain("release evidence manifest could not be read safely");
  });
});
