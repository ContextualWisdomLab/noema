import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
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

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function digestArtifact(root: string, relativePath: string, content: string) {
  writeFixture(root, relativePath, content);
  return { path: relativePath, sha256: sha256(content) };
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

function writeSourceOnlyTransferEvidence(root: string): string {
  const licenseBytes = "Apache License 2.0 reviewed fixture.\n";
  writeFixture(root, "LICENSE", licenseBytes);
  writeFixture(
    root,
    "package.json",
    `${JSON.stringify({ name: "noema", private: true }, null, 2)}\n`,
  );

  const artifactRights = `${JSON.stringify({
    schema_version: 1,
    repository: "ContextualWisdomLab/noema",
    tag: "v0.1.0",
    commit_sha: "a".repeat(40),
    artifacts: [
      {
        artifact_kind: "source_archive",
        artifact_identity: `noema-${"a".repeat(40)}.tar.gz`,
      },
    ],
  }, null, 2)}\n`;

  const licensingIp = {
    owner_legal_decision: {
      type: "spdx",
      license_expression: "Apache-2.0",
      evidence: ["legal/outbound-rights-decision.pdf"],
    },
    repository_rights: {
      path: "LICENSE",
      sha256: sha256(licenseBytes),
    },
    release_rights: {
      tag: "v0.1.0",
      commit_sha: "a".repeat(40),
      sbom: digestArtifact(root, "artifacts/release/noema.cdx.json", "{\"bomFormat\":\"CycloneDX\"}\n"),
      dependency_license_inventory: digestArtifact(
        root,
        "artifacts/release/dependency-licenses.json",
        "{\"dependencies\":[]}\n",
      ),
      notice: digestArtifact(root, "artifacts/release/NOTICE.txt", "Reviewed third-party notices.\n"),
      provenance: digestArtifact(root, "artifacts/release/provenance.sigstore.json", "{\"verified\":true}\n"),
      artifact_rights_metadata: digestArtifact(
        root,
        "artifacts/release/artifact-rights-metadata.json",
        artifactRights,
      ),
    },
    contributor_ip: {
      ownership_evidence: ["legal/contributor-ownership-register.pdf"],
      assignment_evidence: ["legal/ip-assignment-register.pdf"],
    },
  };

  return writeFixture(
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
      licensing_ip: licensingIp,
    }, null, 2)}\n`,
  );
}

function runReportOnlyAudit(root: string, transferEvidencePath: string) {
  const outputDir = join(root, "audit-output");
  const script = resolve("scripts/acquisition-readiness-audit.mjs");
  const inheritedEnvironment = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("NOEMA_")),
  );
  const result = spawnSync(process.execPath, [script], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...inheritedEnvironment,
      NOEMA_AUDIT_REPORT_ONLY: "1",
      NOEMA_TRANSFER_EVIDENCE_PATH: transferEvidencePath,
      NOEMA_ACQUISITION_AUDIT_OUTPUT_DIR: outputDir,
    },
  });
  const auditPath = join(outputDir, "acquisition-audit.json");
  if (!existsSync(auditPath)) return { result, transferCheck: undefined };
  const audit = JSON.parse(readFileSync(auditPath, "utf8"));
  const transferCheck = audit.checks.find(
    (check: { name?: string }) => check.name === "transfer evidence pass",
  );
  return { result, transferCheck };
}

afterEach(() => {
  while (temporaryRoots.length > 0) {
    const root = temporaryRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("source-only repository licensing", () => {
  it("accepts a private non-published npm manifest when repository source rights are complete", () => {
    const root = mkdtempSync(join(tmpdir(), "noema-source-only-license-"));
    temporaryRoots.push(root);
    writeRequiredDocs(root);
    const transferEvidencePath = writeSourceOnlyTransferEvidence(root);

    const { result, transferCheck } = runReportOnlyAudit(root, transferEvidencePath);

    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(transferCheck).toBeDefined();
    expect(transferCheck.pass).toBe(true);
    expect(transferCheck.details.licensingIpFailures).toEqual([]);
  });
});
