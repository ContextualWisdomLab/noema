import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function runRevenueAudit(revenue: Record<string, unknown>) {
  const root = mkdtempSync(join(tmpdir(), "noema-acquisition-revenue-domain-"));
  const revenuePath = join(root, "revenue.json");
  const outputDir = join(root, "audit");
  const inheritedEnvironment = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("NOEMA_")),
  );
  writeFileSync(revenuePath, JSON.stringify(revenue));

  const result = spawnSync(process.execPath, ["scripts/acquisition-readiness-audit.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...inheritedEnvironment,
      NOEMA_AUDIT_REPORT_ONLY: "1",
      NOEMA_ACQUISITION_AUDIT_OUTPUT_DIR: outputDir,
      NOEMA_REVENUE_EVIDENCE_PATH: revenuePath,
      NOEMA_TRANSFER_EVIDENCE_PATH: join(root, "missing-transfer.json"),
      NOEMA_PILOT_LOG_PATH: join(root, "missing-pilot.md"),
      NOEMA_SALEABLE_AUDIT_PATH: join(root, "missing-saleable.json"),
      NOEMA_DATA_ROOM_MANIFEST_PATH: join(root, "missing-data-room.json"),
    },
  });

  const audit = JSON.parse(readFileSync(join(outputDir, "acquisition-audit.json"), "utf8"));
  const revenueCheck = audit.checks.find(
    (check: { name: string }) => check.name === "revenue evidence supports 2B target",
  );
  rmSync(root, { recursive: true, force: true });
  return { result, revenueCheck };
}

function passingRevenue(overrides: Record<string, unknown> = {}) {
  return {
    arr_krw: 300_000_000,
    gross_margin: 0.75,
    paid_customers: 3,
    pipeline_weighted_krw: 500_000_000,
    loi_count: 3,
    customer_concentration_top1: 0.5,
    updated_at: new Date().toISOString(),
    owner: "finance",
    source_documents: ["crm:noema-arr-report"],
    ...overrides,
  };
}

describe("acquisition revenue metric authority", () => {
  for (const [field, value] of [
    ["arr_krw", "Infinity"],
    ["gross_margin", "0.75"],
    ["paid_customers", 3.5],
    ["customer_concentration_top1", -1],
  ] as const) {
    it(`rejects invalid ARR evidence metric ${field}=${String(value)}`, () => {
      const { revenueCheck } = runRevenueAudit(passingRevenue({ [field]: value }));

      expect(revenueCheck.pass).toBe(false);
      expect(revenueCheck.details.metricFailures).toEqual(
        expect.arrayContaining([expect.stringContaining(field)]),
      );
    });
  }

  it("keeps canonical numeric ARR evidence eligible for the threshold route", () => {
    const { revenueCheck } = runRevenueAudit(passingRevenue());

    expect(revenueCheck.pass).toBe(true);
    expect(revenueCheck.details.metricFailures).toEqual([]);
  });
});
