import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function runAudit(env: NodeJS.ProcessEnv = {}) {
  return spawnSync("node", ["scripts/acquisition-readiness-audit.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...env,
    },
    encoding: "utf8",
  });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function writePassingDataRoomManifest(path: string) {
  writeFileSync(path, JSON.stringify({
    objective: "NOEMA-GOAL-ACQUISITION-2B-2026-07-02",
    passed: true,
    finalGatePassed: true,
    missingFinalGate: [],
    entries: [],
  }));
}

describe("acquisition-readiness-audit", () => {
  it("fails closed when acquisition evidence is missing", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-acq-missing-"));
    const result = runAudit({
      NOEMA_ACQUISITION_AUDIT_OUTPUT_DIR: temp,
      NOEMA_REVENUE_EVIDENCE_PATH: join(temp, "missing-revenue.json"),
      NOEMA_TRANSFER_EVIDENCE_PATH: join(temp, "missing-transfer.json"),
      NOEMA_SALEABLE_AUDIT_PATH: join(temp, "missing-saleable.json"),
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("acquisition-readiness-audit: FAIL");
    expect(result.stdout).toContain("revenue evidence present");
  });

  it("passes when 2B acquisition evidence and saleable evidence are present", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-acq-pass-"));
    const revenuePath = join(temp, "revenue.json");
    const transferPath = join(temp, "transfer.json");
    const saleablePath = join(temp, "saleable.json");
    const dataRoomPath = join(temp, "data-room-manifest.json");

    writeFileSync(revenuePath, JSON.stringify({
      arr_krw: 300_000_000,
      gross_margin: 0.75,
      paid_customers: 3,
      pipeline_weighted_krw: 500_000_000,
      loi_count: 3,
      customer_concentration_top1: 0.5,
      updated_at: today(),
      owner: "finance",
      source_documents: ["crm:noema-arr-report"],
    }));
    writeFileSync(transferPath, JSON.stringify({
      license_review: "pass",
      third_party_review: "pass",
      github_app_transfer_plan: "pass",
      cloudflare_transfer_plan: "pass",
      secrets_rotation_plan: "pass",
      owner_transfer_plan: "pass",
      privacy_review: "pass",
      updated_at: today(),
      owner: "legal",
      source_documents: ["docs/buyer-due-diligence-index.md"],
    }));
    writeFileSync(saleablePath, JSON.stringify({
      objective: "NOEMA-GOAL-SALEABLE-2026-07-02",
      passed: true,
    }));
    writePassingDataRoomManifest(dataRoomPath);

    const result = runAudit({
      NOEMA_ACQUISITION_AUDIT_OUTPUT_DIR: temp,
      NOEMA_REVENUE_EVIDENCE_PATH: revenuePath,
      NOEMA_TRANSFER_EVIDENCE_PATH: transferPath,
      NOEMA_SALEABLE_AUDIT_PATH: saleablePath,
      NOEMA_DATA_ROOM_MANIFEST_PATH: dataRoomPath,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("acquisition-readiness-audit: PASS");
  });

  it("uses the latest dated saleable readiness audit by default", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-acq-latest-"));
    const revenuePath = join(temp, "revenue.json");
    const transferPath = join(temp, "transfer.json");
    const dataRoomPath = join(temp, "data-room-manifest.json");
    const saleableRoot = join(process.cwd(), "artifacts", "saleable-readiness");
    const olderDir = join(saleableRoot, "20991230");
    const latestDir = join(saleableRoot, "20991231");

    rmSync(olderDir, { recursive: true, force: true });
    rmSync(latestDir, { recursive: true, force: true });
    try {
      mkdirSync(olderDir, { recursive: true });
      mkdirSync(latestDir, { recursive: true });
      writeFileSync(revenuePath, JSON.stringify({
        arr_krw: 300_000_000,
        gross_margin: 0.75,
        paid_customers: 3,
        customer_concentration_top1: 0.5,
        updated_at: today(),
        owner: "finance",
        source_documents: ["crm:noema-arr-report"],
      }));
      writeFileSync(transferPath, JSON.stringify({
        license_review: "pass",
        third_party_review: "pass",
        github_app_transfer_plan: "pass",
        cloudflare_transfer_plan: "pass",
        secrets_rotation_plan: "pass",
        owner_transfer_plan: "pass",
        privacy_review: "pass",
        updated_at: today(),
        owner: "legal",
        source_documents: ["docs/buyer-due-diligence-index.md"],
      }));
      writeFileSync(join(olderDir, "goal-audit.json"), JSON.stringify({
        objective: "NOEMA-GOAL-SALEABLE-2026-07-02",
        passed: false,
      }));
      writeFileSync(join(latestDir, "goal-audit.json"), JSON.stringify({
        objective: "NOEMA-GOAL-SALEABLE-2026-07-02",
        passed: true,
      }));
      writePassingDataRoomManifest(dataRoomPath);

      const result = runAudit({
        NOEMA_ACQUISITION_AUDIT_OUTPUT_DIR: temp,
        NOEMA_REVENUE_EVIDENCE_PATH: revenuePath,
        NOEMA_TRANSFER_EVIDENCE_PATH: transferPath,
        NOEMA_DATA_ROOM_MANIFEST_PATH: dataRoomPath,
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("acquisition-readiness-audit: PASS");
    } finally {
      rmSync(olderDir, { recursive: true, force: true });
      rmSync(latestDir, { recursive: true, force: true });
    }
  });

  it("requires buyer due diligence Q&A evidence for the strategic pipeline route", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-acq-pipeline-"));
    const revenuePath = join(temp, "revenue.json");
    const transferPath = join(temp, "transfer.json");
    const saleablePath = join(temp, "saleable.json");
    const dataRoomPath = join(temp, "data-room-manifest.json");

    writeFileSync(revenuePath, JSON.stringify({
      arr_krw: 0,
      gross_margin: 0,
      paid_customers: 1,
      pipeline_weighted_krw: 500_000_000,
      loi_count: 3,
      customer_concentration_top1: 1,
      updated_at: today(),
      owner: "sales",
      source_documents: ["crm:noema-enterprise-pipeline"],
    }));
    writeFileSync(transferPath, JSON.stringify({
      license_review: "pass",
      third_party_review: "pass",
      github_app_transfer_plan: "pass",
      cloudflare_transfer_plan: "pass",
      secrets_rotation_plan: "pass",
      owner_transfer_plan: "pass",
      privacy_review: "pass",
      updated_at: today(),
      owner: "legal",
      source_documents: ["docs/buyer-due-diligence-index.md"],
    }));
    writeFileSync(saleablePath, JSON.stringify({
      objective: "NOEMA-GOAL-SALEABLE-2026-07-02",
      passed: true,
    }));
    writePassingDataRoomManifest(dataRoomPath);

    const missingQna = runAudit({
      NOEMA_ACQUISITION_AUDIT_OUTPUT_DIR: temp,
      NOEMA_REVENUE_EVIDENCE_PATH: revenuePath,
      NOEMA_TRANSFER_EVIDENCE_PATH: transferPath,
      NOEMA_SALEABLE_AUDIT_PATH: saleablePath,
      NOEMA_DATA_ROOM_MANIFEST_PATH: dataRoomPath,
    });

    expect(missingQna.status).toBe(1);
    expect(missingQna.stdout).toContain("revenue evidence supports 2B target");

    writeFileSync(revenuePath, JSON.stringify({
      arr_krw: 0,
      gross_margin: 0,
      paid_customers: 1,
      pipeline_weighted_krw: 500_000_000,
      loi_count: 3,
      customer_concentration_top1: 1,
      buyer_due_diligence_qna: ["crm:noema-enterprise-security-qna"],
      updated_at: today(),
      owner: "sales",
      source_documents: ["crm:noema-enterprise-pipeline"],
    }));

    const withQna = runAudit({
      NOEMA_ACQUISITION_AUDIT_OUTPUT_DIR: temp,
      NOEMA_REVENUE_EVIDENCE_PATH: revenuePath,
      NOEMA_TRANSFER_EVIDENCE_PATH: transferPath,
      NOEMA_SALEABLE_AUDIT_PATH: saleablePath,
      NOEMA_DATA_ROOM_MANIFEST_PATH: dataRoomPath,
    });

    expect(withQna.status).toBe(0);
    expect(withQna.stdout).toContain("acquisition-readiness-audit: PASS");
  });

  it("fails closed when the data-room manifest belongs to another objective", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-acq-manifest-objective-"));
    const revenuePath = join(temp, "revenue.json");
    const transferPath = join(temp, "transfer.json");
    const saleablePath = join(temp, "saleable.json");
    const dataRoomPath = join(temp, "data-room-manifest.json");

    writeFileSync(revenuePath, JSON.stringify({
      arr_krw: 300_000_000,
      gross_margin: 0.75,
      paid_customers: 3,
      customer_concentration_top1: 0.5,
      updated_at: today(),
      owner: "finance",
      source_documents: ["crm:noema-arr-report"],
    }));
    writeFileSync(transferPath, JSON.stringify({
      license_review: "pass",
      third_party_review: "pass",
      github_app_transfer_plan: "pass",
      cloudflare_transfer_plan: "pass",
      secrets_rotation_plan: "pass",
      owner_transfer_plan: "pass",
      privacy_review: "pass",
      updated_at: today(),
      owner: "legal",
      source_documents: ["docs/buyer-due-diligence-index.md"],
    }));
    writeFileSync(saleablePath, JSON.stringify({
      objective: "NOEMA-GOAL-SALEABLE-2026-07-02",
      passed: true,
    }));
    writeFileSync(dataRoomPath, JSON.stringify({
      objective: "OTHER-GOAL",
      passed: true,
      finalGatePassed: true,
      missingFinalGate: [],
      entries: [],
    }));

    const result = runAudit({
      NOEMA_ACQUISITION_AUDIT_OUTPUT_DIR: temp,
      NOEMA_REVENUE_EVIDENCE_PATH: revenuePath,
      NOEMA_TRANSFER_EVIDENCE_PATH: transferPath,
      NOEMA_SALEABLE_AUDIT_PATH: saleablePath,
      NOEMA_DATA_ROOM_MANIFEST_PATH: dataRoomPath,
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("data room manifest final gate pass");
  });

  it("fails closed when acquisition evidence lacks fresh source metadata", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-acq-stale-"));
    const revenuePath = join(temp, "revenue.json");
    const transferPath = join(temp, "transfer.json");
    const saleablePath = join(temp, "saleable.json");
    const dataRoomPath = join(temp, "data-room-manifest.json");

    writeFileSync(revenuePath, JSON.stringify({
      arr_krw: 300_000_000,
      gross_margin: 0.75,
      paid_customers: 3,
      customer_concentration_top1: 0.5,
      updated_at: "2000-01-01",
      owner: "finance",
      source_documents: ["crm:noema-arr-report"],
    }));
    writeFileSync(transferPath, JSON.stringify({
      license_review: "pass",
      third_party_review: "pass",
      github_app_transfer_plan: "pass",
      cloudflare_transfer_plan: "pass",
      secrets_rotation_plan: "pass",
      owner_transfer_plan: "pass",
      privacy_review: "pass",
      updated_at: today(),
      owner: "legal",
      source_documents: ["docs/buyer-due-diligence-index.md"],
    }));
    writeFileSync(saleablePath, JSON.stringify({
      objective: "NOEMA-GOAL-SALEABLE-2026-07-02",
      passed: true,
    }));
    writePassingDataRoomManifest(dataRoomPath);

    const result = runAudit({
      NOEMA_ACQUISITION_AUDIT_OUTPUT_DIR: temp,
      NOEMA_REVENUE_EVIDENCE_PATH: revenuePath,
      NOEMA_TRANSFER_EVIDENCE_PATH: transferPath,
      NOEMA_SALEABLE_AUDIT_PATH: saleablePath,
      NOEMA_DATA_ROOM_MANIFEST_PATH: dataRoomPath,
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("revenue evidence supports 2B target");
  });
});
