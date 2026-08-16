import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readStrictJsonEvidence } from "../scripts/lib/strict-json-evidence.mjs";

const temporaryDirectories: string[] = [];

function createEvidenceFile(content: string | Buffer): string {
  const directory = mkdtempSync(join(tmpdir(), "noema-saleable-json-"));
  temporaryDirectories.push(directory);
  const path = join(directory, "evidence.json");
  writeFileSync(path, content);
  return path;
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop()!, { force: true, recursive: true });
  }
});

describe("saleable-readiness JSON evidence integrity", () => {
  it("accepts a bounded regular file with unambiguous UTF-8 JSON", () => {
    const path = createEvidenceFile('{"status":"PASS","records":30}');

    expect(readStrictJsonEvidence(path)).toEqual({
      ok: true,
      path,
      value: { status: "PASS", records: 30 },
    });
  });

  it("rejects escape-equivalent duplicate decoded keys before JSON.parse", () => {
    const path = createEvidenceFile('{"status":"FAIL","st\\u0061tus":"PASS"}');

    expect(readStrictJsonEvidence(path)).toEqual({
      ok: false,
      path,
      reason: "duplicate_keys",
    });
  });

  it("rejects malformed UTF-8 instead of replacement-decoding evidence", () => {
    const path = createEvidenceFile(Buffer.from([0x7b, 0x22, 0xff, 0x22, 0x3a, 0x31, 0x7d]));

    expect(readStrictJsonEvidence(path)).toEqual({
      ok: false,
      path,
      reason: "invalid_json",
    });
  });

  it("rejects syntactically invalid JSON with a fixed non-secret reason", () => {
    const path = createEvidenceFile('{"status":');

    expect(readStrictJsonEvidence(path)).toEqual({
      ok: false,
      path,
      reason: "invalid_json",
    });
  });

  it("rejects missing or unsafe files before decoding", () => {
    expect(
      readStrictJsonEvidence("unsafe.json", {
        readRaw: () => null,
      }),
    ).toEqual({
      ok: false,
      path: "unsafe.json",
      reason: "missing_or_unsafe",
    });
  });

  it("fails closed when the descriptor-safe reader throws", () => {
    expect(
      readStrictJsonEvidence("raced.json", {
        readRaw: () => {
          throw new Error("untrusted filesystem detail");
        },
      }),
    ).toEqual({
      ok: false,
      path: "raced.json",
      reason: "missing_or_unsafe",
    });
  });

  it("routes every readiness JSON input through the strict evidence boundary", () => {
    const script = readFileSync("scripts/saleable-readiness-audit.mjs", "utf8");

    for (const evidencePath of [
      "kpiEvidencePath",
      "smokeEvidence",
      "securityEvidencePath",
    ]) {
      expect(script).toContain(`readStrictJsonEvidence(${evidencePath})`);
    }
    expect(script).not.toContain("JSON.parse(readFileSync(kpiEvidencePath");
    expect(script).not.toContain("JSON.parse(readFileSync(smokeEvidence");
    expect(script).not.toContain("function readJson(path)");
  });
});
