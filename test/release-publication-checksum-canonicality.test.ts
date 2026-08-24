import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

function buildFixture(temp: string) {
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
    verifiedAt: "2026-08-03T14:00:00.000Z",
    workflowRunUrl: `https://github.com/${repository}/actions/runs/123`,
  });

  return {
    releaseDir,
    checksumsPath,
    policyPath,
    releaseViewPath,
    releaseApiPath,
    verificationPath,
    outputPath,
  };
}

function synchronizeChecksumAssetMetadata(fixture: ReturnType<typeof buildFixture>) {
  const name = "SHA256SUMS";
  const size = readFileSync(fixture.checksumsPath).length;
  const checksumDigest = `sha256:${digest(fixture.checksumsPath)}`;

  const view = JSON.parse(readFileSync(fixture.releaseViewPath, "utf8"));
  const viewAsset = view.assets.find((asset: { name: string }) => asset.name === name);
  viewAsset.size = size;
  writeJson(fixture.releaseViewPath, view);

  const api = JSON.parse(readFileSync(fixture.releaseApiPath, "utf8"));
  const apiAsset = api.assets.find((asset: { name: string }) => asset.name === name);
  apiAsset.size = size;
  apiAsset.digest = checksumDigest;
  writeJson(fixture.releaseApiPath, api);
}

function runReceipt(temp: string, mutate: (fixture: ReturnType<typeof buildFixture>) => void) {
  const fixture = buildFixture(temp);
  mutate(fixture);
  synchronizeChecksumAssetMetadata(fixture);

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
        NOEMA_RELEASE_GENERATED_AT: "2026-08-03T14:00:01.000Z",
      },
      encoding: "utf8",
    },
  );
  return result;
}

describe("release publication checksum authority", () => {
  it.each([
    ["leading whitespace", (text: string) => ` ${text}`],
    ["trailing whitespace", (text: string) => text.replace(/\n$/, " \n")],
    ["tab separator", (text: string) => text.replace("  ", "\t\t")],
  ])("rejects non-canonical %s instead of normalizing it", (_label, mutateText) => {
    const temp = mkdtempSync(join(tmpdir(), "noema-release-checksum-canonical-"));
    try {
      const result = runReceipt(temp, (fixture) => {
        const original = readFileSync(fixture.checksumsPath, "utf8");
        writeFileSync(fixture.checksumsPath, mutateText(original), "utf8");
      });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("SHA256SUMS");
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });
});
