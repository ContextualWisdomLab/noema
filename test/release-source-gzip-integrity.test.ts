import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

const commitSha = "a".repeat(40);

function gitArchive(format: "tar" | "tar.gz") {
  const result = spawnSync(
    "git",
    [
      "archive",
      `--format=${format}`,
      "--prefix=noema-0.1.0/",
      "HEAD",
    ],
    {
      cwd: process.cwd(),
      encoding: null,
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  expect(result.status).toBe(0);
  expect(result.stderr.toString("utf8")).toBe("");
  expect(result.stdout.byteLength).toBeGreaterThan(1024);
  return result.stdout;
}

function writeTarOctalField(block: Buffer, offset: number, length: number, value: number) {
  const text = `${value.toString(8).padStart(length - 1, "0")}\0`;
  block.write(text, offset, length, "ascii");
}

function paxRecord(key: string, value: string) {
  const suffix = ` ${key}=${value}\n`;
  let length = Buffer.byteLength(suffix, "utf8") + 1;
  while (true) {
    const record = `${length}${suffix}`;
    const actualLength = Buffer.byteLength(record, "utf8");
    if (actualLength === length) {
      return Buffer.from(record, "utf8");
    }
    length = actualLength;
  }
}

function paxGlobalMetadataArchive() {
  const payload = paxRecord("mtime", "0");
  const header = Buffer.alloc(512);
  header.write("PaxHeaders/noema", 0, "ascii");
  writeTarOctalField(header, 100, 8, 0o644);
  writeTarOctalField(header, 108, 8, 0);
  writeTarOctalField(header, 116, 8, 0);
  writeTarOctalField(header, 124, 12, payload.byteLength);
  writeTarOctalField(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  header.write("g", 156, "ascii");
  header.write("ustar\0", 257, "ascii");
  header.write("00", 263, "ascii");
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
  const payloadPadding = Buffer.alloc((512 - (payload.byteLength % 512)) % 512);
  return Buffer.concat([header, payload, payloadPadding, Buffer.alloc(1024)]);
}

function runReleaseEvidence(sourceBytes: Uint8Array) {
  const temp = mkdtempSync(join(tmpdir(), "noema-release-source-gzip-"));
  const sourcePath = join(temp, `noema-${commitSha}.tar.gz`);
  const sbomPath = join(temp, "noema.cdx.json");
  const outputDir = join(temp, "release");

  writeFileSync(sourcePath, sourceBytes);
  writeFileSync(
    sbomPath,
    JSON.stringify({
      $schema: "http://cyclonedx.org/schema/bom-1.5.schema.json",
      bomFormat: "CycloneDX",
      specVersion: "1.5",
      serialNumber: "urn:uuid:00000000-0000-4000-8000-000000000001",
      version: 1,
      metadata: {
        component: {
          type: "application",
          name: "noema",
          version: "0.1.0",
          "bom-ref": "noema@0.1.0",
        },
      },
      components: [],
      dependencies: [{ ref: "noema@0.1.0", dependsOn: [] }],
    }),
    "utf8",
  );

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
        GITHUB_REPOSITORY: "ContextualWisdomLab/noema",
        GITHUB_SHA: commitSha,
        GITHUB_REF: "refs/tags/v0.1.0",
        NOEMA_RELEASE_VERSION: "0.1.0",
        NOEMA_RELEASE_GENERATED_AT: "2026-08-03T00:00:00.000Z",
      },
      encoding: "utf8",
    },
  );

  rmSync(temp, { recursive: true, force: true });
  return result;
}

describe("release source tar.gz authority", () => {
  it("rejects non-gzip bytes presented as the release tar.gz subject", () => {
    const result = runReleaseEvidence(Buffer.from("bounded-source-archive", "utf8"));

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("gzip");
  });

  it("rejects gzip-compressed bytes that are not a tar archive", () => {
    const result = runReleaseEvidence(
      gzipSync(Buffer.from("bounded-source-archive", "utf8")),
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("tar");
  });

  it("rejects an empty tar envelope with no source entries", () => {
    const result = runReleaseEvidence(gzipSync(Buffer.alloc(1024)));

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("tar");
  });

  it("rejects a gzip-compressed tar with a corrupted entry header", () => {
    const tarBytes = Buffer.from(gitArchive("tar"));
    tarBytes[0] ^= 0x01;
    const result = runReleaseEvidence(gzipSync(tarBytes));

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("tar");
  });

  it("rejects a gzip-compressed tar truncated before its terminating blocks", () => {
    const tarBytes = gitArchive("tar");
    const result = runReleaseEvidence(gzipSync(tarBytes.subarray(0, 512)));

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("tar");
  });

  it("rejects non-zero bytes after the first tar end-of-archive records", () => {
    const tarBytes = gitArchive("tar");
    const result = runReleaseEvidence(
      gzipSync(Buffer.concat([tarBytes, Buffer.from("trailing-source-bytes", "utf8")])),
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("tar");
  });

  it("rejects a complete non-tar block appended after the first archive", () => {
    const tarBytes = gitArchive("tar");
    const result = runReleaseEvidence(
      gzipSync(Buffer.concat([tarBytes, Buffer.alloc(512, 0x41)])),
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("tar");
  });

  it("rejects metadata-only tar records after the first end-of-archive records", () => {
    const tarBytes = gitArchive("tar");
    const result = runReleaseEvidence(
      gzipSync(Buffer.concat([tarBytes, paxGlobalMetadataArchive()])),
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("tar");
  });

  it("rejects a second concatenated tar archive after the first archive ends", () => {
    const tarBytes = gitArchive("tar");
    const result = runReleaseEvidence(
      gzipSync(Buffer.concat([tarBytes, tarBytes])),
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("tar");
  });

  it("accepts the exact git archive tar.gz shape used by the release workflow", () => {
    const result = runReleaseEvidence(gitArchive("tar.gz"));

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("release-evidence: PASS");
  });
});
