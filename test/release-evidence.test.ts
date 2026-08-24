import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

const repository = "ContextualWisdomLab/noema";
const commitSha = "a".repeat(40);

function validSbom() {
  return {
    $schema: "http://cyclonedx.org/schema/bom-1.5.schema.json",
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    serialNumber: "urn:uuid:00000000-0000-4000-8000-000000000001",
    version: 1,
    metadata: {
      timestamp: "2026-08-03T00:00:00.000Z",
      component: {
        type: "application",
        name: "noema",
        version: "0.1.0",
        "bom-ref": "noema@0.1.0",
      },
    },
    components: [
      {
        type: "library",
        name: "vitest",
        version: "4.1.9",
        "bom-ref": "pkg:npm/vitest@4.1.9",
      },
    ],
    dependencies: [
      { ref: "noema@0.1.0", dependsOn: ["pkg:npm/vitest@4.1.9"] },
      { ref: "pkg:npm/vitest@4.1.9", dependsOn: [] },
    ],
  };
}

function runEvidence(
  temp: string,
  sbom = validSbom(),
  sbomBytes?: Uint8Array,
  releaseCommitSha = commitSha,
  sourceCommitSha = releaseCommitSha,
) {
  const sourcePath = join(temp, `noema-${sourceCommitSha}.tar.gz`);
  const sbomPath = join(temp, "noema.cdx.json");
  const outputDir = join(temp, "release");
  writeFileSync(sourcePath, gzipSync(Buffer.from("bounded-source-archive", "utf8")));
  if (sbomBytes) {
    writeFileSync(sbomPath, sbomBytes);
  } else {
    writeFileSync(sbomPath, JSON.stringify(sbom), "utf8");
  }

  const result = spawnSync(
    process.execPath,
    [
      "scripts/release-evidence.mjs",
      "--source",
      sourcePath,
      "--sbom",
      sbomPath,
      "--output-dir",
      outputDir,
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        GITHUB_REPOSITORY: repository,
        GITHUB_SHA: releaseCommitSha,
        GITHUB_REF: "refs/tags/v0.1.0",
        NOEMA_RELEASE_VERSION: "0.1.0",
        NOEMA_RELEASE_GENERATED_AT: "2026-08-03T00:00:00.000Z",
      },
      encoding: "utf8",
    },
  );

  return { result, outputDir, sourcePath, sbomPath };
}

describe("signed release evidence", () => {
  it("builds a checksummed buyer-verifiable release manifest", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-release-evidence-"));
    try {
      const { result, outputDir } = runEvidence(temp);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("release-evidence: PASS");
      const manifest = JSON.parse(
        readFileSync(join(outputDir, "release-evidence.json"), "utf8"),
      );
      const checksums = readFileSync(join(outputDir, "SHA256SUMS"), "utf8");

      expect(manifest.schemaVersion).toBe(1);
      expect(manifest.source).toEqual({
        repository,
        commitSha,
        ref: "refs/tags/v0.1.0",
        version: "0.1.0",
      });
      expect(manifest.subject.name).toBe(`noema-${commitSha}.tar.gz`);
      expect(manifest.subject.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(manifest.subject.bytes).toBeGreaterThan(0);
      expect(manifest.subject.mediaType).toBe("application/gzip");
      expect(manifest.sbom).toMatchObject({
        name: "noema.cdx.json",
        bomFormat: "CycloneDX",
        specVersion: "1.5",
        componentCount: 1,
        dependencyCount: 2,
        rootComponent: {
          type: "application",
          name: "noema",
          version: "0.1.0",
        },
      });
      expect(manifest.sbom.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(checksums).toContain(`  ${manifest.subject.name}`);
      expect(checksums).toContain("  noema.cdx.json");
      expect(checksums).toContain("  release-evidence.json");
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("rejects an uppercase release commit SHA as non-canonical identity", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-release-uppercase-sha-"));
    try {
      const uppercaseSha = commitSha.toUpperCase();
      const { result, outputDir } = runEvidence(
        temp,
        validSbom(),
        undefined,
        uppercaseSha,
      );

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("lowercase");
      expect(() => readFileSync(join(outputDir, "release-evidence.json"))).toThrow();
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("rejects whitespace-normalized release commit authority", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-release-spaced-sha-"));
    try {
      const { result, outputDir } = runEvidence(
        temp,
        validSbom(),
        undefined,
        ` ${commitSha}`,
        commitSha,
      );

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("canonical");
      expect(() => readFileSync(join(outputDir, "release-evidence.json"))).toThrow();
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it.each([
    ["wrong format", { ...validSbom(), bomFormat: "SPDX" }, "CycloneDX"],
    [
      "wrong root type",
      {
        ...validSbom(),
        metadata: {
          ...validSbom().metadata,
          component: { ...validSbom().metadata.component, type: "library" },
        },
      },
      "application",
    ],
    [
      "wrong root version",
      {
        ...validSbom(),
        metadata: {
          ...validSbom().metadata,
          component: { ...validSbom().metadata.component, version: "9.9.9" },
        },
      },
      "0.1.0",
    ],
  ])("fails closed on %s SBOM metadata", (_label, sbom, expected) => {
    const temp = mkdtempSync(join(tmpdir(), "noema-release-invalid-"));
    try {
      const { result, outputDir } = runEvidence(temp, sbom);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(expected);
      expect(() => readFileSync(join(outputDir, "release-evidence.json"))).toThrow();
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("does not echo untrusted SBOM metadata into failure output", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-release-redaction-"));
    const sensitiveName = ["ghp", "_", "B".repeat(36)].join("");
    try {
      const sbom = validSbom();
      sbom.metadata.component.name = sensitiveName;
      const { result, outputDir } = runEvidence(temp, sbom);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("root component name must be noema");
      expect(result.stderr).not.toContain(sensitiveName);
      expect(() => readFileSync(join(outputDir, "release-evidence.json"))).toThrow();
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("fails closed on malformed UTF-8 SBOM bytes", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-release-invalid-utf8-"));
    try {
      const validBytes = Buffer.from(JSON.stringify(validSbom()), "utf8");
      const malformedBytes = Buffer.concat([
        Buffer.from('{"evidence_note":"', "utf8"),
        Buffer.from([0x80]),
        Buffer.from('\",', "utf8"),
        validBytes.subarray(1),
      ]);
      const { result, outputDir } = runEvidence(temp, validSbom(), malformedBytes);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("UTF-8");
      expect(() => readFileSync(join(outputDir, "release-evidence.json"))).toThrow();
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("keeps syntactically invalid JSON distinct from malformed UTF-8", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-release-invalid-json-"));
    try {
      const { result, outputDir } = runEvidence(
        temp,
        validSbom(),
        Buffer.from('{"bomFormat":"CycloneDX"', "utf8"),
      );

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("not valid JSON");
      expect(result.stderr).not.toContain("not valid UTF-8");
      expect(() => readFileSync(join(outputDir, "release-evidence.json"))).toThrow();
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("does not echo malformed JSON content into failure output", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-release-invalid-json-redaction-"));
    const sensitiveValue = ["ghp", "_", "C".repeat(36)].join("");
    try {
      const malformedJson = Buffer.from(`{"broken": ${sensitiveValue}}`, "utf8");
      const { result, outputDir } = runEvidence(
        temp,
        validSbom(),
        malformedJson,
      );

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("SBOM is not valid JSON");
      expect(result.stderr).not.toContain(sensitiveValue.slice(0, 12));
      expect(() => readFileSync(join(outputDir, "release-evidence.json"))).toThrow();
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("pins an isolated tag/manual workflow with provenance and SBOM attestations", () => {
    const workflow = readFileSync(".github/workflows/release-evidence.yml", "utf8");

    expect(workflow).toContain("tags:");
    expect(workflow).toContain('      - "v*.*.*"');
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("attestations: write");
    expect(workflow).toContain("id-token: write");
    expect(workflow).toContain("artifact-metadata: write");
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("npm run release:verify");
    expect(workflow).toContain("npm sbom --package-lock-only --sbom-format=cyclonedx --sbom-type=application");
    expect(workflow).toContain("git archive --format=tar.gz");
    expect(workflow).toContain("node scripts/release-evidence.mjs");
    expect(workflow.match(/actions\/attest@59d89421af93a897026c735860bf21b6eb4f7b26/g)?.length).toBe(2);
    expect(workflow.match(/create-storage-record: true/g)?.length).toBe(2);
    expect(workflow).not.toContain("create-storage-record: false");
    expect(workflow).toContain("sbom-path:");
    expect(workflow).toContain("gh attestation verify");
    expect(workflow).toContain("--deny-self-hosted-runners");
    expect(workflow).toContain("retention-days: 90");
    expect(workflow).not.toContain("secrets.");
    expect(workflow).not.toContain("wrangler deploy");
  });

  it("documents offline and online buyer verification", () => {
    const documentation = readFileSync("docs/release-supply-chain.md", "utf8");

    expect(documentation).toContain("gh attestation verify");
    expect(documentation).toContain("gh attestation download");
    expect(documentation).toContain("gh attestation trusted-root");
    expect(documentation).toContain("SHA256SUMS");
    expect(documentation).toContain("CycloneDX");
    expect(documentation).toContain("source archive");
    expect(documentation).toContain("does not prove deployment");
  });
});
