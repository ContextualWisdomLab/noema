import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function runAudit(saleablePath: string, outputDir: string) {
  return spawnSync("node", ["scripts/acquisition-readiness-audit.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NOEMA_ACQUISITION_AUDIT_OUTPUT_DIR: outputDir,
      NOEMA_REVENUE_EVIDENCE_PATH: join(outputDir, "missing-revenue.json"),
      NOEMA_TRANSFER_EVIDENCE_PATH: join(outputDir, "missing-transfer.json"),
      NOEMA_SALEABLE_AUDIT_PATH: saleablePath,
      NOEMA_DATA_ROOM_MANIFEST_PATH: join(outputDir, "missing-data-room.json"),
    },
    encoding: "utf8",
  });
}

function saleableEvidenceCheck(outputDir: string) {
  const audit = JSON.parse(
    readFileSync(join(outputDir, "acquisition-audit.json"), "utf8"),
  );
  return audit.checks.find(
    (check: { name: string }) => check.name === "saleable readiness evidence present",
  );
}

describe("acquisition readiness JSON integrity", () => {
  it("rejects duplicate decoded object keys instead of accepting JSON.parse last-key-wins", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-acq-duplicate-json-"));
    const saleablePath = join(temp, "saleable.json");
    writeFileSync(
      saleablePath,
      '{"objective":"NOEMA-GOAL-SALEABLE-2026-07-02","passed":true,"p\\u0061ssed":false}',
    );

    const result = runAudit(saleablePath, temp);

    expect(result.status).toBe(1);
    expect(saleableEvidenceCheck(temp)).toMatchObject({
      pass: false,
      details: { reason: "duplicate_json_key", path: saleablePath },
    });
  });

  it("rejects malformed UTF-8 before JSON parsing can normalize replacement characters", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-acq-invalid-utf8-"));
    const saleablePath = join(temp, "saleable.json");
    const prefix = Buffer.from(
      '{"objective":"NOEMA-GOAL-SALEABLE-2026-07-02","passed":true,"note":"',
      "utf8",
    );
    const suffix = Buffer.from('"}', "utf8");
    writeFileSync(saleablePath, Buffer.concat([prefix, Buffer.from([0x80]), suffix]));

    const result = runAudit(saleablePath, temp);

    expect(result.status).toBe(1);
    expect(saleableEvidenceCheck(temp)).toMatchObject({
      pass: false,
      details: { reason: "invalid_utf8", path: saleablePath },
    });
  });
});
