import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
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

function writeDigestArtifact(root: string, relativePath: string, content: string) {
  writeFixture(root, relativePath, content);
  return {
    path: relativePath,
    sha256: sha256(content),
  };
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

function writeTransferEvidence(
  root: string,
  licensingIp?: Record<string, unknown>,
): string {
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
      ...(licensingIp ? { licensing_ip: licensingIp } : {}),
    }, null, 2)}\n`,
  );
}

function validCustomLicensingIp(root: string): Record<string, unknown> {
  const rightsBytes = "Copyright ContextualWisdomLab. All rights reserved.\n";
  writeFixture(root, "RIGHTS.md", rightsBytes);
  writeFixture(
    root,
    "package.json",
    `${JSON.stringify({
      name: "noema",
      private: true,
      license: "SEE LICENSE IN RIGHTS.md",
    }, null, 2)}\n`,
  );

  return {
    owner_legal_decision: {
      type: "custom",
      evidence: ["legal/outbound-rights-decision.pdf"],
    },
    repository_rights: {
      path: "RIGHTS.md",
      sha256: sha256(rightsBytes),
    },
    package_metadata: {
      license: "SEE LICENSE IN RIGHTS.md",
    },
    release_rights: {
      tag: "v0.1.0",
      commit_sha: "a".repeat(40),
      sbom: writeDigestArtifact(
        root,
        "artifacts/release/noema.cdx.json",
        "{\"bomFormat\":\"CycloneDX\"}\n",
      ),
      dependency_license_inventory: writeDigestArtifact(
        root,
        "artifacts/release/dependency-licenses.json",
        "{\"dependencies\":[]}\n",
      ),
      notice: writeDigestArtifact(
        root,
        "artifacts/release/NOTICE.txt",
        "Reviewed third-party notices.\n",
      ),
      provenance: writeDigestArtifact(
        root,
        "artifacts/release/provenance.sigstore.json",
        "{\"verified\":true}\n",
      ),
    },
    contributor_ip: {
      ownership_evidence: ["legal/contributor-ownership-register.pdf"],
      assignment_evidence: ["legal/ip-assignment-register.pdf"],
    },
  };
}

function runReportOnlyAudit(root: string, transferEvidencePath: string) {
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
  const audit = JSON.parse(readFileSync(join(outputDir, "acquisition-audit.json"), "utf8"));
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

describe("acquisition transfer-rights evidence", () => {
  it("fails closed when pass labels are not bound to licensing and IP artifacts", () => {
    const root = mkdtempSync(join(tmpdir(), "noema-transfer-rights-"));
    temporaryRoots.push(root);
    writeRequiredAcquisitionDocs(root);
    const transferEvidencePath = writeTransferEvidence(root);

    const { result, transferCheck } = runReportOnlyAudit(root, transferEvidencePath);

    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(transferCheck).toBeDefined();
    expect(transferCheck.pass).toBe(false);
    expect(transferCheck.details.licensingIpFailures).toEqual(
      expect.arrayContaining([
        "licensing_ip evidence object required",
      ]),
    );
  });

  it("accepts a complete custom-rights package and exact-release transfer binding", () => {
    const root = mkdtempSync(join(tmpdir(), "noema-transfer-rights-green-"));
    temporaryRoots.push(root);
    writeRequiredAcquisitionDocs(root);
    const transferEvidencePath = writeTransferEvidence(root, validCustomLicensingIp(root));

    const { result, transferCheck } = runReportOnlyAudit(root, transferEvidencePath);

    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(transferCheck).toBeDefined();
    expect(transferCheck.pass).toBe(true);
    expect(transferCheck.details.licensingIpFailures).toEqual([]);
  });

  it("rejects transfer evidence when package metadata contradicts the owner-approved custom rights", () => {
    const root = mkdtempSync(join(tmpdir(), "noema-transfer-rights-mismatch-"));
    temporaryRoots.push(root);
    writeRequiredAcquisitionDocs(root);
    const licensingIp = validCustomLicensingIp(root);
    writeFixture(
      root,
      "package.json",
      `${JSON.stringify({
        name: "noema",
        private: true,
        license: "UNLICENSED",
      }, null, 2)}\n`,
    );
    licensingIp.package_metadata = { license: "UNLICENSED" };
    const transferEvidencePath = writeTransferEvidence(root, licensingIp);

    const { result, transferCheck } = runReportOnlyAudit(root, transferEvidencePath);

    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(transferCheck).toBeDefined();
    expect(transferCheck.pass).toBe(false);
    expect(transferCheck.details.licensingIpFailures).toEqual(
      expect.arrayContaining([
        "custom rights decision requires package.json SEE LICENSE IN metadata",
      ]),
    );
  });

  it("rejects a release-rights digest that does not match the retained exact-release artifact", () => {
    const root = mkdtempSync(join(tmpdir(), "noema-transfer-rights-digest-"));
    temporaryRoots.push(root);
    writeRequiredAcquisitionDocs(root);
    const licensingIp = validCustomLicensingIp(root);
    const releaseRights = licensingIp.release_rights as Record<string, unknown>;
    const sbom = releaseRights.sbom as Record<string, unknown>;
    sbom.sha256 = "c".repeat(64);
    const transferEvidencePath = writeTransferEvidence(root, licensingIp);

    const { result, transferCheck } = runReportOnlyAudit(root, transferEvidencePath);

    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(transferCheck).toBeDefined();
    expect(transferCheck.pass).toBe(false);
    expect(transferCheck.details.licensingIpFailures).toEqual(
      expect.arrayContaining([
        "release_rights.sbom.sha256 does not match retained artifact bytes",
      ]),
    );
  });

  it("rejects a release artifact reached through a symlinked parent outside the repository", () => {
    const root = mkdtempSync(join(tmpdir(), "noema-transfer-rights-parent-link-"));
    const outside = mkdtempSync(join(tmpdir(), "noema-transfer-rights-parent-target-"));
    temporaryRoots.push(root, outside);
    writeRequiredAcquisitionDocs(root);
    const licensingIp = validCustomLicensingIp(root);
    const externalSbom = "{\"bomFormat\":\"CycloneDX\",\"outside\":true}\n";
    writeFixture(outside, "noema.cdx.json", externalSbom);
    mkdirSync(join(root, "artifacts"), { recursive: true });
    symlinkSync(outside, join(root, "artifacts", "linked-release"), "dir");
    const releaseRights = licensingIp.release_rights as Record<string, unknown>;
    releaseRights.sbom = {
      path: "artifacts/linked-release/noema.cdx.json",
      sha256: sha256(externalSbom),
    };
    const transferEvidencePath = writeTransferEvidence(root, licensingIp);

    const { result, transferCheck } = runReportOnlyAudit(root, transferEvidencePath);

    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(transferCheck).toBeDefined();
    expect(transferCheck.pass).toBe(false);
    expect(transferCheck.details.licensingIpFailures).toContain(
      "release_rights.sbom.path must reference a stable bounded regular retained artifact",
    );
  });

  it("rejects repository-rights bytes supplied through a symlinked root notice", () => {
    const root = mkdtempSync(join(tmpdir(), "noema-transfer-rights-leaf-link-"));
    const outside = mkdtempSync(join(tmpdir(), "noema-transfer-rights-leaf-target-"));
    temporaryRoots.push(root, outside);
    writeRequiredAcquisitionDocs(root);
    const licensingIp = validCustomLicensingIp(root);
    const rightsBytes = "Copyright ContextualWisdomLab. All rights reserved.\n";
    const outsideRights = writeFixture(outside, "RIGHTS.md", rightsBytes);
    rmSync(join(root, "RIGHTS.md"));
    symlinkSync(outsideRights, join(root, "RIGHTS.md"), "file");
    const transferEvidencePath = writeTransferEvidence(root, licensingIp);

    const { result, transferCheck } = runReportOnlyAudit(root, transferEvidencePath);

    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(transferCheck).toBeDefined();
    expect(transferCheck.pass).toBe(false);
    expect(transferCheck.details.licensingIpFailures).toContain(
      "repository rights file missing or unreadable: RIGHTS.md",
    );
  });
});
