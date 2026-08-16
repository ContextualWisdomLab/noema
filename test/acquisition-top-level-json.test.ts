import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

function writeFixture(root: string, relativePath: string, content: string): string {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
  return path;
}

function writeRequiredDocs(root: string): void {
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
}

describe("top-level acquisition JSON evidence", () => {
  it("rejects duplicate decoded revenue keys instead of accepting the last value", () => {
    const root = mkdtempSync(join(tmpdir(), "noema-acquisition-duplicate-revenue-"));
    try {
      writeRequiredDocs(root);
      const revenuePath = writeFixture(
        root,
        "artifacts/acquisition/revenue-evidence.json",
        `{
  "arr_krw": 0,
  "arr_krw": 300000000,
  "gross_margin": 0.75,
  "paid_customers": 3,
  "customer_concentration_top1": 0.5,
  "pipeline_weighted_krw": 0,
  "loi_count": 0,
  "updated_at": "${new Date().toISOString()}",
  "owner": "finance",
  "source_documents": ["crm:noema-arr-report"]
}\n`,
      );
      const outputDir = join(root, "audit-output");
      const inheritedEnvironment = Object.fromEntries(
        Object.entries(process.env).filter(([key]) => !key.startsWith("NOEMA_")),
      );
      const result = spawnSync(process.execPath, [resolve("scripts/acquisition-readiness-audit.mjs")], {
        cwd: root,
        encoding: "utf8",
        env: {
          ...inheritedEnvironment,
          NOEMA_AUDIT_REPORT_ONLY: "1",
          NOEMA_REVENUE_EVIDENCE_PATH: revenuePath,
          NOEMA_ACQUISITION_AUDIT_OUTPUT_DIR: outputDir,
        },
      });

      expect(result.status, result.stderr || result.stdout).toBe(0);
      const audit = JSON.parse(readFileSync(join(outputDir, "acquisition-audit.json"), "utf8"));
      const presenceCheck = audit.checks.find(
        (check: { name?: string }) => check.name === "revenue evidence present",
      );
      const readinessCheck = audit.checks.find(
        (check: { name?: string }) => check.name === "revenue evidence supports 2B target",
      );

      expect(presenceCheck).toBeDefined();
      expect(presenceCheck.pass).toBe(false);
      expect(presenceCheck.details.reason).toBe("duplicate_json_key");
      expect(readinessCheck).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
