import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const temporaryRoots: string[] = [];

function writeFixture(root: string, relativePath: string, content: string): string {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
  return path;
}

function writeRequiredAcquisitionDocs(root: string): void {
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
  writeFixture(
    root,
    "docs/saleable-program-goal-registry.md",
    "NOEMA-GOAL-SALEABLE-2026-07-02\n",
  );
  writeFixture(root, "docs/pricing-draft.md", "pricing draft\n");
  writeFixture(root, "docs/terms-draft.md", "terms draft\n");
  writeFixture(root, "docs/sla-and-support.md", "support draft\n");
}

afterEach(() => {
  while (temporaryRoots.length > 0) {
    const root = temporaryRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("acquisition transfer-rights evidence", () => {
  it("fails closed when pass labels are not bound to licensing and IP artifacts", () => {
    const root = mkdtempSync(join(tmpdir(), "noema-transfer-rights-"));
    temporaryRoots.push(root);
    writeRequiredAcquisitionDocs(root);

    const transferEvidencePath = writeFixture(
      root,
      "artifacts/acquisition/transfer-evidence.json",
      `${JSON.stringify({
        owner: "Acquisition counsel",
        source_documents: ["legal/review-record.pdf"],
        updated_at: new Date().toISOString(),
        license_review: "pass",
        third_party_review: "pass",
        github_app_transfer_plan: "pass",
        cloudflare_transfer_plan: "pass",
        secrets_rotation_plan: "pass",
        owner_transfer_plan: "pass",
        privacy_review: "pass",
      }, null, 2)}\n`,
    );
    const outputDir = join(root, "audit-output");
    const script = resolve("scripts/acquisition-readiness-audit.mjs");

    const result = spawnSync(process.execPath, [script], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        NOEMA_AUDIT_REPORT_ONLY: "1",
        NOEMA_TRANSFER_EVIDENCE_PATH: transferEvidencePath,
        NOEMA_ACQUISITION_AUDIT_OUTPUT_DIR: outputDir,
      },
    });

    expect(result.status, result.stderr || result.stdout).toBe(0);
    const audit = JSON.parse(readFileSync(join(outputDir, "acquisition-audit.json"), "utf8"));
    const transferCheck = audit.checks.find(
      (check: { name?: string }) => check.name === "transfer evidence pass",
    );

    expect(transferCheck).toBeDefined();
    expect(transferCheck.pass).toBe(false);
    expect(transferCheck.details.licensingIpFailures).toEqual(
      expect.arrayContaining([
        "licensing_ip evidence object required",
      ]),
    );
  });
});
