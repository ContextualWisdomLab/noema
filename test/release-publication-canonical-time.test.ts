import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const repository = "ContextualWisdomLab/noema";
const commitSha = "a".repeat(40);
const version = "0.1.0";
const tag = `v${version}`;

function digest(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function writeJson(path: string, value: unknown) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function buildFixture(temp: string, verifiedAt: string) {
  const releaseDir = join(temp, "release");
  const attestationsDir = join(releaseDir, "attestations");
  mkdirSync(attestationsDir, { recursive: true });

  const sourceName = `noema-${commitSha}.tar.gz`;
  const sourcePath = join(releaseDir, sourceName);
  const sbomPath = join(releaseDir, "noema.cdx.json");
  const evidencePath = join(releaseDir, "release-evidence.json");
  const checksumsPath = join(releaseDir, "SHA256SUMS");
  const provenancePath = join(attestationsDir, "provenance.sigstore.json");
  const cyclonedxPath = join(attestationsDir, "cyclonedx-sbom.sigstore.json");

  writeFileSync(sourcePath, "bounded source archive", "utf8");
  writeJson(sbomPath, {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    metadata: { component: { type: "application", name: "noema", version } },
  });
  writeJson(provenancePath, { mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json" });
  writeJson(cyclonedxPath, { mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json" });
  writeJson(evidencePath, {
    schemaVersion: 1,
    source: {
      repository,
      commitSha,
      ref: `refs/tags/${tag}`,
      version,
    },
    subject: {
      name: sourceName,
      sha256: digest(sourcePath),
      bytes: readFileSync(sourcePath).length,
    },
    sbom: {
      name: basename(sbomPath),
      sha256: digest(sbomPath),
      bytes: readFileSync(sbomPath).length,
      bomFormat: "CycloneDX",
      specVersion: "1.5",
      rootComponent: { type: "application", name: "noema", version },
    },
  });
  writeFileSync(
    checksumsPath,
    [
      `${digest(sourcePath)}  ${sourceName}`,
      `${digest(sbomPath)}  noema.cdx.json`,
      `${digest(evidencePath)}  release-evidence.json`,
    ].join("\n") + "\n",
    "utf8",
  );

  const assetPaths = [
    sourcePath,
    sbomPath,
    evidencePath,
    checksumsPath,
    provenancePath,
    cyclonedxPath,
  ];
  const releaseAssets = assetPaths.map((path) => ({
    name: basename(path),
    size: readFileSync(path).length,
    digest: `sha256:${digest(path)}`,
  }));

  const policyPath = join(temp, "immutable-policy.json");
  const releaseViewPath = join(temp, "release-view.json");
  const releaseApiPath = join(temp, "release-api.json");
  const verificationPath = join(temp, "release-verification.json");
  const outputPath = join(temp, "release-publication-receipt.json");

  writeJson(policyPath, { enabled: true, enforced_by_owner: true });
  writeJson(releaseViewPath, {
    isImmutable: true,
    tagName: tag,
    targetCommitish: "main",
    url: `https://github.com/${repository}/releases/tag/${tag}`,
    assets: releaseAssets.map(({ name, size }) => ({ name, size })),
  });
  writeJson(releaseApiPath, {
    immutable: true,
    tag_name: tag,
    target_commitish: "main",
    html_url: `https://github.com/${repository}/releases/tag/${tag}`,
    assets: releaseAssets,
  });
  writeJson(verificationPath, {
    releaseVerified: true,
    resolvedTagCommitSha: commitSha,
    verifiedAssets: releaseAssets.map(({ name }) => name),
    verifiedAt,
    workflowRunUrl: `https://github.com/${repository}/actions/runs/123`,
  });

  return {
    releaseDir,
    policyPath,
    releaseViewPath,
    releaseApiPath,
    verificationPath,
    outputPath,
  };
}

function runReceipt(generatedAt: string, verifiedAt = "2026-08-03T14:00:00.000Z") {
  const temp = mkdtempSync(join(tmpdir(), "noema-release-publication-time-"));
  const fixture = buildFixture(temp, verifiedAt);
  const result = spawnSync(
    process.execPath,
    [
      "scripts/release-publication-receipt.mjs",
      "--policy",
      fixture.policyPath,
      "--release-view",
      fixture.releaseViewPath,
      "--release-api",
      fixture.releaseApiPath,
      "--verification",
      fixture.verificationPath,
      "--release-evidence",
      join(fixture.releaseDir, "release-evidence.json"),
      "--asset-dir",
      fixture.releaseDir,
      "--output",
      fixture.outputPath,
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        GITHUB_REPOSITORY: repository,
        NOEMA_RELEASE_TAG: tag,
        NOEMA_RELEASE_COMMIT_SHA: commitSha,
        NOEMA_RELEASE_VERSION: version,
        NOEMA_RELEASE_GENERATED_AT: generatedAt,
      },
      encoding: "utf8",
    },
  );
  let receipt: unknown = null;
  if (existsSync(fixture.outputPath)) {
    receipt = JSON.parse(readFileSync(fixture.outputPath, "utf8"));
  }
  rmSync(temp, { recursive: true, force: true });
  return { result, receipt };
}

const nonCanonicalTimestamps = [
  "2026-08-03",
  "2026-08-03T23:00:01.000+09:00",
  "2026-08-03T14:00:01Z",
  "2026-02-30T14:00:01.000Z",
  "2026-13-03T14:00:01.000Z",
  " 2026-08-03T14:00:01.000Z",
  "2026-08-03T14:00:01.000Z ",
];

describe("release publication timestamp integrity", () => {
  it.each(nonCanonicalTimestamps)(
    "rejects non-canonical generatedAt %s before receipt publication",
    (generatedAt) => {
      const { result, receipt } = runReceipt(generatedAt);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "NOEMA_RELEASE_GENERATED_AT must be a canonical UTC timestamp",
      );
      expect(receipt).toBeNull();
    },
  );

  it.each(nonCanonicalTimestamps)(
    "rejects non-canonical verification verifiedAt %s before receipt publication",
    (verifiedAt) => {
      const { result, receipt } = runReceipt("2026-08-03T14:00:01.000Z", verifiedAt);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "release verification verifiedAt must be a canonical UTC timestamp",
      );
      expect(receipt).toBeNull();
    },
  );

  it("rejects a future generatedAt even when it is canonical UTC", () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { result, receipt } = runReceipt(future);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("NOEMA_RELEASE_GENERATED_AT cannot be in the future");
    expect(receipt).toBeNull();
  });

  it("rejects a future verification instant instead of manufacturing completed verification", () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { result, receipt } = runReceipt("2026-08-03T14:00:01.000Z", future);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("release verification verifiedAt cannot be in the future");
    expect(receipt).toBeNull();
  });

  it("retains canonical UTC millisecond timestamps verbatim", () => {
    const generatedAt = "2026-08-03T14:00:01.000Z";
    const verifiedAt = "2026-08-03T14:00:00.000Z";
    const { result, receipt } = runReceipt(generatedAt, verifiedAt);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(receipt).toMatchObject({
      generatedAt,
      verification: { verifiedAt },
    });
  });
});
