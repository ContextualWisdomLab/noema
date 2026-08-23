import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const repository = "ContextualWisdomLab/noema";
const commitSha = "a".repeat(40);
const missingPath = "test/fixtures/does-not-exist-release-semver-evidence.json";
const invalidVersions = [
  "01.0.0",
  "1.02.3",
  "1.2.03",
  "1.2.3-..",
  "1.2.3-alpha..1",
  "1.2.3-01",
];

function releaseEnvironment(version: string) {
  return {
    ...process.env,
    GITHUB_REPOSITORY: repository,
    GITHUB_SHA: commitSha,
    GITHUB_REF: `refs/tags/v${version}`,
    NOEMA_RELEASE_TAG: `v${version}`,
    NOEMA_RELEASE_COMMIT_SHA: commitSha,
    NOEMA_RELEASE_VERSION: version,
    NOEMA_RELEASE_GENERATED_AT: "2026-08-03T14:00:01.000Z",
  };
}

function runReleaseEvidence(
  version: string,
  overrides: Record<string, string> = {},
) {
  return spawnSync(
    process.execPath,
    [
      "scripts/release-evidence.mjs",
      "--source",
      `test/fixtures/noema-${commitSha}.tar.gz`,
      "--sbom",
      "test/fixtures/noema.cdx.json",
      "--output-dir",
      "test/fixtures/does-not-exist-release-semver-output",
    ],
    {
      cwd: process.cwd(),
      env: { ...releaseEnvironment(version), ...overrides },
      encoding: "utf8",
    },
  );
}

function runPublicationReceipt(version: string) {
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
      "test/fixtures/does-not-exist-release-semver-receipt.json",
    ],
    {
      cwd: process.cwd(),
      env: releaseEnvironment(version),
      encoding: "utf8",
    },
  );
}

describe("canonical release SemVer identity", () => {
  it.each(invalidVersions)(
    "rejects noncanonical release-evidence version %s before artifact access",
    (version) => {
      const result = runReleaseEvidence(version);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("release version is not valid SemVer");
      expect(result.stderr).not.toContain("source archive could not be read safely");
    },
  );

  it.each(invalidVersions)(
    "rejects noncanonical publication version %s before retained-evidence access",
    (version) => {
      const result = runPublicationReceipt(version);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("release version is not valid SemVer");
      expect(result.stderr).not.toContain("could not be read safely");
    },
  );

  it.each(["0.1.0", "1.2.3-alpha.1", "10.20.30-rc.1"])(
    "keeps reviewed canonical version %s inside the existing release subset",
    (version) => {
      const evidence = runReleaseEvidence(version);
      const publication = runPublicationReceipt(version);

      expect(evidence.stderr).not.toContain("release version is not valid SemVer");
      expect(publication.stderr).not.toContain("release version is not valid SemVer");
    },
  );

  it("rejects whitespace-normalized repository authority before artifact access", () => {
    const result = runReleaseEvidence("0.1.0", {
      GITHUB_REPOSITORY: ` ${repository}\t`,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`release repository must be ${repository}`);
    expect(result.stderr).not.toContain("source archive could not be read safely");
  });

  it("rejects whitespace-normalized release version before artifact access", () => {
    const result = runReleaseEvidence("0.1.0", {
      NOEMA_RELEASE_VERSION: " 0.1.0\n",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("release version is not valid SemVer");
    expect(result.stderr).not.toContain("source archive could not be read safely");
  });

  it("rejects whitespace-normalized release ref before artifact access", () => {
    const result = runReleaseEvidence("0.1.0", {
      GITHUB_REF: " refs/tags/v0.1.0\n",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("release ref must be refs/tags/v0.1.0");
    expect(result.stderr).not.toContain("source archive could not be read safely");
  });
});
