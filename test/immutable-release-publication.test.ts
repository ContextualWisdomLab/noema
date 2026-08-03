import { createHash } from "node:crypto";
import {
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
const expectedStaticAssets = [
  "SHA256SUMS",
  "cyclonedx-sbom.sigstore.json",
  "noema.cdx.json",
  `noema-${commitSha}.tar.gz`,
  "provenance.sigstore.json",
  "release-evidence.json",
].sort();

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
    targetCommitish: commitSha,
    url: `https://github.com/${repository}/releases/tag/${tag}`,
    assets: releaseAssets.map(({ name, size }) => ({ name, size })),
  });
  writeJson(releaseApiPath, {
    immutable: true,
    tag_name: tag,
    target_commitish: commitSha,
    html_url: `https://github.com/${repository}/releases/tag/${tag}`,
    assets: releaseAssets,
  });
  writeJson(verificationPath, {
    releaseVerified: true,
    verifiedAssets: releaseAssets.map(({ name }) => name),
    verifiedAt: "2026-08-03T14:00:00.000Z",
    workflowRunUrl: `https://github.com/${repository}/actions/runs/123`,
  });

  return {
    releaseDir,
    policyPath,
    releaseViewPath,
    releaseApiPath,
    verificationPath,
    outputPath,
    releaseApiPathValue: JSON.parse(readFileSync(releaseApiPath, "utf8")),
  };
}

function runReceipt(temp: string, mutate?: (fixture: ReturnType<typeof buildFixture>) => void) {
  const fixture = buildFixture(temp);
  mutate?.(fixture);
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
  return { fixture, result };
}

describe("immutable buyer release publication", () => {
  it("writes a machine-readable receipt for an immutable verified release", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-immutable-release-"));
    try {
      const { fixture, result } = runReceipt(temp);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("release-publication-receipt: PASS");
      const receipt = JSON.parse(readFileSync(fixture.outputPath, "utf8"));
      expect(receipt.schemaVersion).toBe(1);
      expect(receipt.source).toEqual({ repository, tag, commitSha, version });
      expect(receipt.immutableReleasePolicy).toEqual({
        enabled: true,
        enforcedByOwner: true,
      });
      expect(receipt.release).toMatchObject({
        immutable: true,
        tagName: tag,
        targetCommitish: commitSha,
      });
      expect(receipt.verification).toMatchObject({
        releaseVerified: true,
        verifiedAssets: expectedStaticAssets,
      });
      expect(receipt.assets.map((asset: { name: string }) => asset.name)).toEqual(
        expectedStaticAssets,
      );
      expect(
        receipt.assets.every(
          (asset: { sha256: string; apiDigest: string; bytes: number }) =>
            /^[a-f0-9]{64}$/.test(asset.sha256)
            && asset.apiDigest === `sha256:${asset.sha256}`
            && asset.bytes > 0,
        ),
      ).toBe(true);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it.each([
    ["disabled immutable policy", "policy", "immutable releases policy"],
    ["mutable release view", "view", "isImmutable"],
    ["mutable release API", "api", "immutable"],
    ["unverified release", "verification", "release verification"],
    ["wrong target commit", "target", "target commit"],
    ["asset digest mismatch", "digest", "digest mismatch"],
    ["missing verified asset", "verified_assets", "verified asset set"],
  ])("fails closed on %s", (_label, failure, expectedMessage) => {
    const temp = mkdtempSync(join(tmpdir(), "noema-immutable-release-fail-"));
    try {
      const { fixture, result } = runReceipt(temp, (value) => {
        if (failure === "policy") {
          writeJson(value.policyPath, { enabled: false, enforced_by_owner: false });
        } else if (failure === "view") {
          const view = JSON.parse(readFileSync(value.releaseViewPath, "utf8"));
          view.isImmutable = false;
          writeJson(value.releaseViewPath, view);
        } else if (failure === "api") {
          const api = JSON.parse(readFileSync(value.releaseApiPath, "utf8"));
          api.immutable = false;
          writeJson(value.releaseApiPath, api);
        } else if (failure === "verification") {
          const verification = JSON.parse(readFileSync(value.verificationPath, "utf8"));
          verification.releaseVerified = false;
          writeJson(value.verificationPath, verification);
        } else if (failure === "target") {
          const api = JSON.parse(readFileSync(value.releaseApiPath, "utf8"));
          api.target_commitish = "b".repeat(40);
          writeJson(value.releaseApiPath, api);
        } else if (failure === "digest") {
          const api = JSON.parse(readFileSync(value.releaseApiPath, "utf8"));
          api.assets[0].digest = `sha256:${"0".repeat(64)}`;
          writeJson(value.releaseApiPath, api);
        } else if (failure === "verified_assets") {
          const verification = JSON.parse(readFileSync(value.verificationPath, "utf8"));
          verification.verifiedAssets = verification.verifiedAssets.slice(1);
          writeJson(value.verificationPath, verification);
        }
      });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(expectedMessage);
      expect(() => readFileSync(fixture.outputPath)).toThrow();
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("isolates publication permission and verifies every durable release asset", () => {
    const workflow = readFileSync(".github/workflows/release-evidence.yml", "utf8");

    expect(workflow).toContain("publish_release:");
    expect(workflow).toContain("needs: attest_release");
    expect(workflow).toContain("contents: write");
    expect(workflow).toContain("actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093");
    expect(workflow).toContain("repos/${GITHUB_REPOSITORY}/immutable-releases");
    expect(workflow).toContain("gh release create");
    expect(workflow).toContain("--verify-tag");
    expect(workflow).toContain("--target \"$RELEASE_COMMIT_SHA\"");
    expect(workflow).not.toContain("--clobber");
    expect(workflow).toContain("gh release view");
    expect(workflow).toContain("isImmutable,tagName,targetCommitish,assets,url");
    expect(workflow).toContain("gh release verify \"$RELEASE_TAG\"");
    expect(workflow).toContain("gh release verify-asset");
    expect(workflow).toContain("release-publication-receipt.json");
    expect(workflow).toContain("retention-days: 365");

    const publicationJob = workflow.slice(workflow.indexOf("  publish_release:"));
    expect(publicationJob).not.toContain("actions/checkout@");
    expect(publicationJob).not.toContain("secrets.");
    expect(publicationJob).not.toContain("wrangler deploy");
    expect(publicationJob).not.toContain("NOEMA_LLM");
    expect(publicationJob).not.toContain("GITHUB_APP_PRIVATE_KEY");
  });

  it("requires the publication receipt in acquisition evidence", () => {
    const manifest = readFileSync("scripts/acquisition-data-room-manifest.mjs", "utf8");
    const audit = readFileSync("scripts/acquisition-readiness-audit.mjs", "utf8");
    const documentation = readFileSync("docs/release-supply-chain.md", "utf8");

    expect(manifest).toContain("release-publication-receipt");
    expect(manifest).toContain("artifacts/acquisition/release-publication-receipt.json");
    expect(audit).toContain("release publication receipt present");
    expect(audit).toContain("release publication receipt pass");
    expect(documentation).toContain("immutable GitHub Release");
    expect(documentation).toContain("gh release verify-asset");
    expect(documentation).toContain("does not prove deployment");
  });
});
