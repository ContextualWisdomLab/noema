import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const auditScript = resolve("scripts/acquisition-readiness-audit.mjs");

function writeFixture(root: string, relativePath: string, content: string): string {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
  return path;
}

function prepareAuditRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  writeFixture(
    root,
    "docs/acquisition-readiness-2b.md",
    "NOEMA-GOAL-ACQUISITION-2B-2026-07-02\nKRW 2,000,000,000\nRevenue_PASS\nTransfer_PASS\n",
  );
  writeFixture(
    root,
    "docs/buyer-due-diligence-index.md",
    "npm run acquisition:audit\nartifacts/acquisition/revenue-evidence.json\nartifacts/acquisition/transfer-evidence.json\n",
  );
  writeFixture(
    root,
    "docs/library-boundary-decision.md",
    "현재는 submodule을 만들지 않는다\nnpm workspaces\nSplit Triggers\n",
  );
  writeFixture(
    root,
    "scripts/acquisition-data-room-manifest.mjs",
    "// finalGatePassed data-room-manifest.json release-publication-receipt\n",
  );
  writeFixture(root, "docs/saleable-program-goal-registry.md", "NOEMA-GOAL-SALEABLE-2026-07-02\n");
  writeFixture(root, "docs/pricing-draft.md", "pricing draft\n");
  writeFixture(root, "docs/terms-draft.md", "terms draft\n");
  writeFixture(root, "docs/sla-and-support.md", "support draft\n");
  return root;
}

function runAuditWithRevenueTimestamp(root: string, updatedAt: string) {
  const revenuePath = writeFixture(root, "revenue.json", JSON.stringify({
    arr_krw: 300_000_000,
    gross_margin: 0.75,
    paid_customers: 3,
    pipeline_weighted_krw: 0,
    loi_count: 0,
    customer_concentration_top1: 0.5,
    updated_at: updatedAt,
    owner: "finance",
    source_documents: ["crm:noema-arr-report"],
  }));
  const outputDir = join(root, "audit-output");
  const inheritedEnvironment = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("NOEMA_")),
  );
  const result = spawnSync(process.execPath, [auditScript], {
    cwd: root,
    env: {
      ...inheritedEnvironment,
      NOEMA_AUDIT_REPORT_ONLY: "1",
      NOEMA_ACQUISITION_AUDIT_OUTPUT_DIR: outputDir,
      NOEMA_ACQUISITION_EVIDENCE_MAX_AGE_DAYS: "36500",
      NOEMA_REVENUE_EVIDENCE_PATH: revenuePath,
      NOEMA_TRANSFER_EVIDENCE_PATH: join(root, "missing-transfer.json"),
      NOEMA_PILOT_LOG_PATH: join(root, "missing-pilot.md"),
      NOEMA_SALEABLE_AUDIT_PATH: join(root, "missing-saleable.json"),
      NOEMA_DATA_ROOM_MANIFEST_PATH: join(root, "missing-data-room.json"),
    },
    encoding: "utf8",
  });
  const audit = JSON.parse(readFileSync(join(outputDir, "acquisition-audit.json"), "utf8"));
  return { result, audit };
}

function revenueMetadataFailures(audit: { checks: Array<{ name: string; details: { metadataFailures: string[] } }> }) {
  return audit.checks.find(
    (check) => check.name === "revenue evidence supports 2B target",
  )!.details.metadataFailures;
}

describe("acquisition evidence timestamp integrity", () => {
  for (const updatedAt of [
    "08/21/2026",
    "2026-02-30",
    "2026-08-21 12:00:00",
    "2026-08-21T12:00:00+99:99",
  ]) {
    it(`rejects non-canonical updated_at ${updatedAt}`, () => {
      const root = prepareAuditRoot("noema-acq-iso-date-");
      try {
        const { result, audit } = runAuditWithRevenueTimestamp(root, updatedAt);
        expect(result.status, result.stderr || result.stdout).toBe(0);
        expect(revenueMetadataFailures(audit)).toContain(
          "updated_at must be an ISO date or timestamp",
        );
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  }

  it("rejects future-dated evidence instead of granting a one-day freshness grace period", () => {
    const root = prepareAuditRoot("noema-acq-future-evidence-");
    try {
      const updatedAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const { result, audit } = runAuditWithRevenueTimestamp(root, updatedAt);
      expect(result.status, result.stderr || result.stdout).toBe(0);
      expect(revenueMetadataFailures(audit)).toContain("updated_at cannot be in the future");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("accepts a canonical timezone-bearing ISO timestamp", () => {
    const root = prepareAuditRoot("noema-acq-valid-iso-timestamp-");
    try {
      const updatedAt = new Date(Date.now() - 60_000).toISOString();
      const { result, audit } = runAuditWithRevenueTimestamp(root, updatedAt);
      expect(result.status, result.stderr || result.stdout).toBe(0);
      expect(revenueMetadataFailures(audit)).not.toContain(
        "updated_at must be an ISO date or timestamp",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
