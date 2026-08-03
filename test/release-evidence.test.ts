import { describe, expect, it } from "vitest";
import {
  buildReleaseEvidenceManifest,
  collectLockedComponents,
  sha256Hex,
  validateCycloneDxReleaseSbom,
} from "../scripts/lib/release-evidence.mjs";

const packageJson = {
  name: "noema",
  version: "0.1.0",
};

const packageLock = {
  name: "noema",
  version: "0.1.0",
  lockfileVersion: 3,
  packages: {
    "": { name: "noema", version: "0.1.0" },
    "node_modules/alpha": { name: "alpha", version: "1.2.3" },
    "node_modules/bravo": { name: "bravo", version: "2.0.0" },
    "node_modules/nested/node_modules/alpha": { name: "alpha", version: "1.2.3" },
  },
};

function validSbom() {
  return {
    $schema: "http://cyclonedx.org/schema/bom-1.5.schema.json",
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    serialNumber: "urn:uuid:12345678-1234-4234-9234-123456789abc",
    version: 1,
    metadata: {
      component: {
        type: "application",
        name: "noema",
        version: "0.1.0",
        "bom-ref": "pkg:npm/noema@0.1.0",
      },
    },
    components: [
      {
        type: "library",
        name: "alpha",
        version: "1.2.3",
        "bom-ref": "pkg:npm/alpha@1.2.3",
        purl: "pkg:npm/alpha@1.2.3",
      },
      {
        type: "library",
        name: "bravo",
        version: "2.0.0",
        "bom-ref": "pkg:npm/bravo@2.0.0",
        purl: "pkg:npm/bravo@2.0.0",
      },
    ],
    dependencies: [
      {
        ref: "pkg:npm/noema@0.1.0",
        dependsOn: ["pkg:npm/alpha@1.2.3", "pkg:npm/bravo@2.0.0"],
      },
      { ref: "pkg:npm/alpha@1.2.3", dependsOn: [] },
      { ref: "pkg:npm/bravo@2.0.0", dependsOn: [] },
    ],
  };
}

describe("release evidence SBOM validation", () => {
  it("deduplicates lockfile components by exact package identity", () => {
    expect(collectLockedComponents(packageLock)).toEqual([
      "alpha@1.2.3",
      "bravo@2.0.0",
    ]);
  });

  it("accepts a complete CycloneDX application SBOM bound to package-lock", () => {
    expect(
      validateCycloneDxReleaseSbom(validSbom(), packageJson, packageLock),
    ).toEqual({
      format: "CycloneDX",
      specVersion: "1.5",
      root: "noema@0.1.0",
      componentCount: 2,
      lockedComponentCount: 2,
    });
  });

  it.each([
    ["wrong format", { bomFormat: "SPDX" }, "bomFormat must be CycloneDX"],
    ["unsupported version", { specVersion: "1.4" }, "specVersion must be 1.5 or 1.6"],
    ["missing serial", { serialNumber: "" }, "serialNumber must be a UUID URN"],
  ])("rejects %s", (_label, patch, message) => {
    expect(() =>
      validateCycloneDxReleaseSbom(
        { ...validSbom(), ...patch },
        packageJson,
        packageLock,
      ),
    ).toThrow(message);
  });

  it("requires an application root matching package metadata", () => {
    const sbom = validSbom();
    sbom.metadata.component.type = "library";
    sbom.metadata.component.version = "9.9.9";

    expect(() =>
      validateCycloneDxReleaseSbom(sbom, packageJson, packageLock),
    ).toThrow("metadata.component must identify noema@0.1.0 as an application");
  });

  it("fails closed when a lockfile dependency is absent from the SBOM", () => {
    const sbom = validSbom();
    sbom.components = sbom.components.filter((component) => component.name !== "bravo");

    expect(() =>
      validateCycloneDxReleaseSbom(sbom, packageJson, packageLock),
    ).toThrow("SBOM is missing lockfile components: bravo@2.0.0");
  });

  it("rejects duplicate or incomplete component identities", () => {
    const sbom = validSbom();
    sbom.components.push({ ...sbom.components[0] });

    expect(() =>
      validateCycloneDxReleaseSbom(sbom, packageJson, packageLock),
    ).toThrow("SBOM component identities must be unique");
  });
});

describe("release evidence manifest", () => {
  it("uses deterministic SHA-256 and sorted subjects", () => {
    const manifest = buildReleaseEvidenceManifest({
      repository: "ContextualWisdomLab/noema",
      version: "0.1.0",
      commitSha: "a".repeat(40),
      sourceRef: "refs/tags/v0.1.0",
      generatedAt: "2026-08-03T00:00:00.000Z",
      subjects: [
        { name: "zeta.tar.gz", bytes: Buffer.from("z") },
        { name: "alpha.cdx.json", bytes: Buffer.from("a") },
      ],
      sbomSummary: {
        format: "CycloneDX",
        specVersion: "1.5",
        root: "noema@0.1.0",
        componentCount: 2,
        lockedComponentCount: 2,
      },
    });

    expect(sha256Hex(Buffer.from("a"))).toBe(
      "ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb",
    );
    expect(manifest.subjects.map((subject) => subject.name)).toEqual([
      "alpha.cdx.json",
      "zeta.tar.gz",
    ]);
    expect(manifest).toMatchObject({
      schemaVersion: 1,
      repository: "ContextualWisdomLab/noema",
      version: "0.1.0",
      commitSha: "a".repeat(40),
      sourceRef: "refs/tags/v0.1.0",
      sbom: {
        format: "CycloneDX",
        predicateType: "https://cyclonedx.org/bom",
      },
    });
  });

  it("rejects invalid repository, version, SHA, ref, and empty subjects", () => {
    expect(() =>
      buildReleaseEvidenceManifest({
        repository: "outside/noema",
        version: "not-semver",
        commitSha: "short",
        sourceRef: "main",
        generatedAt: "invalid",
        subjects: [],
        sbomSummary: {},
      }),
    ).toThrow("release evidence metadata is invalid");
  });
});
