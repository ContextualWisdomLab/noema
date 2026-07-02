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

function writePassingPilotLog(path: string) {
  writeFileSync(path, `# 파일럿 온보딩 진행 기록

## 항목 1
- 고객명: Acme Security
- 시작일: 2026-06-15
- 담당자(공급자/고객): Noema / Acme 운영팀
- 환경: production
- NOEMA URL: https://noema.acme-security.com/exchange
- 계약/제안 단계:
- [x] 가격 합의
- [x] SLA/지원 범위 합의
- [x] 이용약관 확정
- 지원 채널 합의: Slack acme-noema-ops
- 증빙 출처: production
- 계약/매출 증빙 경로: contracts/acme-paid-pilot.pdf

## 기술 검증
- [x] /health 확인
- [x] /exchange 정상 토큰 교환 1건 이상
- [x] 실패 응답이 표준 에러 코드로만 발생
- [x] x-trace-id, x-latency-ms 헤더 확인
- [x] 장애 대응 알림 규칙 적용

## KPI 증빙
- 분석 데이터 경로: artifacts/saleable-readiness/20260702/noema-kpi-evidence.json
- exchange_failure_rate: 0
- exchange_p95_latency_ms: 157
- 30일 구간 충족 여부:
- [x] 실패율 <= 0.02
- [x] p95 < 300

## 완료 판단
- [x] 운영 이관 승인
- 운영 전환 승인일: 2026-06-30
- 온보딩 완료일: 2026-07-01

## 완료 증빙
- trace_id 샘플: trace-2f4c9a77-1e8a-4f3b-9b9a-a8c1e6f0b5d1
`);
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
    const pilotPath = join(temp, "pilot.md");

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
    writePassingPilotLog(pilotPath);

    const result = runAudit({
      NOEMA_ACQUISITION_AUDIT_OUTPUT_DIR: temp,
      NOEMA_REVENUE_EVIDENCE_PATH: revenuePath,
      NOEMA_TRANSFER_EVIDENCE_PATH: transferPath,
      NOEMA_PILOT_LOG_PATH: pilotPath,
      NOEMA_SALEABLE_AUDIT_PATH: saleablePath,
      NOEMA_DATA_ROOM_MANIFEST_PATH: dataRoomPath,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("acquisition-readiness-audit: PASS");
  });

  it("requires a completed production pilot record", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-acq-pilot-"));
    const revenuePath = join(temp, "revenue.json");
    const transferPath = join(temp, "transfer.json");
    const saleablePath = join(temp, "saleable.json");
    const dataRoomPath = join(temp, "data-room-manifest.json");
    const pilotPath = join(temp, "pilot.md");

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
    writePassingDataRoomManifest(dataRoomPath);
    writeFileSync(pilotPath, "# 파일럿 온보딩 진행 기록\n\n## 항목 1\n- 고객명:\n");

    const result = runAudit({
      NOEMA_ACQUISITION_AUDIT_OUTPUT_DIR: temp,
      NOEMA_REVENUE_EVIDENCE_PATH: revenuePath,
      NOEMA_TRANSFER_EVIDENCE_PATH: transferPath,
      NOEMA_PILOT_LOG_PATH: pilotPath,
      NOEMA_SALEABLE_AUDIT_PATH: saleablePath,
      NOEMA_DATA_ROOM_MANIFEST_PATH: dataRoomPath,
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("pilot production evidence pass");
  });

  it("uses the latest dated saleable readiness audit by default", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-acq-latest-"));
    const revenuePath = join(temp, "revenue.json");
    const transferPath = join(temp, "transfer.json");
    const dataRoomPath = join(temp, "data-room-manifest.json");
    const pilotPath = join(temp, "pilot.md");
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
      writePassingPilotLog(pilotPath);

      const result = runAudit({
        NOEMA_ACQUISITION_AUDIT_OUTPUT_DIR: temp,
        NOEMA_REVENUE_EVIDENCE_PATH: revenuePath,
        NOEMA_TRANSFER_EVIDENCE_PATH: transferPath,
        NOEMA_PILOT_LOG_PATH: pilotPath,
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
    const pilotPath = join(temp, "pilot.md");

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
    writePassingPilotLog(pilotPath);

    const missingQna = runAudit({
      NOEMA_ACQUISITION_AUDIT_OUTPUT_DIR: temp,
      NOEMA_REVENUE_EVIDENCE_PATH: revenuePath,
      NOEMA_TRANSFER_EVIDENCE_PATH: transferPath,
      NOEMA_PILOT_LOG_PATH: pilotPath,
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
      NOEMA_PILOT_LOG_PATH: pilotPath,
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
    const pilotPath = join(temp, "pilot.md");

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
    writePassingPilotLog(pilotPath);
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
      NOEMA_PILOT_LOG_PATH: pilotPath,
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
    const pilotPath = join(temp, "pilot.md");

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
    writePassingPilotLog(pilotPath);

    const result = runAudit({
      NOEMA_ACQUISITION_AUDIT_OUTPUT_DIR: temp,
      NOEMA_REVENUE_EVIDENCE_PATH: revenuePath,
      NOEMA_TRANSFER_EVIDENCE_PATH: transferPath,
      NOEMA_PILOT_LOG_PATH: pilotPath,
      NOEMA_SALEABLE_AUDIT_PATH: saleablePath,
      NOEMA_DATA_ROOM_MANIFEST_PATH: dataRoomPath,
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("revenue evidence supports 2B target");
  });
});
