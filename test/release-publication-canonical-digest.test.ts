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
    source: { repository, commitSha, ref: `refs/tags/${tag}`, version },
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
    releaseApiPath,
    checksumsPath,
    policyPath,
    releaseViewPath,
    verificationPath,
    outputPath,
  };
}

function runReceipt(temp: string, mutate: (fixture: ReturnType<typeof buildFixture>) => void) {
  const fixture = buildFixture(temp);
  mutate(fixture);
  const result = spawnSync(
    process.execPath,
    [
      "scripts/release-publication-receipt.mjs",
      "--policy", fixture.policyPath,
      "--release-view", fixture.releaseViewPath,
      "--release-api", fixture.releaseApiPath,
      "--verification", fixture.verificationPath,
      "--release-evidence", join(fixture.releaseDir, "release-evidence.json"),
      "--asset-dir", fixture.releaseDir,
      "--output", fixture.outputPath,
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
  return { fixture, result };
}

describe("release publication canonical digest identity", () => {
  it("rejects an uppercase GitHub release asset digest instead of case-folding it", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-release-uppercase-api-digest-"));
    try {
      const { fixture, result } = runReceipt(temp, (value) => {
        const api = JSON.parse(readFileSync(value.releaseApiPath, "utf8"));
        api.assets[0].digest = String(api.assets[0].digest).toUpperCase();
        writeJson(value.releaseApiPath, api);
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("release asset digest must be canonical lowercase sha256");
      expect(existsSync(fixture.outputPath)).toBe(false);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("rejects uppercase SHA256SUMS evidence instead of normalizing it", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-release-uppercase-checksum-"));
    try {
      const { fixture, result } = runReceipt(temp, (value) => {
        const lines = readFileSync(value.checksumsPath, "utf8").trimEnd().split("\n");
        const [hex, name] = lines[0].split("  ");
        lines[0] = `${hex.toUpperCase()}  ${name}`;
        writeFileSync(value.checksumsPath, `${lines.join("\n")}\n`, "utf8");
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("SHA256SUMS contains a non-canonical digest");
      expect(existsSync(fixture.outputPath)).toBe(false);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });
});
