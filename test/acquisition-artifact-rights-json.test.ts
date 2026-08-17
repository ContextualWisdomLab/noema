import { createHash } from "node:crypto";
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

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
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

function digestArtifact(root: string, path: string, content: string) {
  writeFixture(root, path, content);
  return { path, sha256: sha256(content) };
}

describe("acquisition artifact-rights JSON evidence", () => {
  it("rejects duplicate decoded OCI license keys instead of accepting the last JSON value", () => {
    const root = mkdtempSync(join(tmpdir(), "noema-artifact-rights-duplicates-"));
    try {
      writeRequiredDocs(root);
      const rightsBytes = "Apache License 2.0 reviewed fixture.\n";
      writeFixture(root, "LICENSE", rightsBytes);
      writeFixture(
        root,
        "package.json",
        `${JSON.stringify({ name: "noema", private: true, license: "Apache-2.0" }, null, 2)}\n`,
      );

      const artifactRights = `{
  "schema_version": 1,
  "repository": "ContextualWisdomLab/noema",
  "tag": "v0.1.0",
  "commit_sha": "${"a".repeat(40)}",
  "artifacts": [
    {
      "artifact_kind": "oci_image",
      "artifact_identity": "ghcr.io/contextualwisdomlab/noema@sha256:${"b".repeat(64)}",
      "oci_annotations": {
        "org.opencontainers.image.licenses": "MIT",
        "org.opencontainers.image.licenses": "Apache-2.0"
      }
    }
  ]
}\n`;
      const artifactRightsBinding = digestArtifact(
        root,
        "artifacts/release/artifact-rights-metadata.json",
        artifactRights,
      );
      const releaseBytes = "retained exact-release evidence\n";
      const transferPath = writeFixture(
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
          licensing_ip: {
            owner_legal_decision: {
              type: "spdx",
              license_expression: "Apache-2.0",
              evidence: ["legal/outbound-rights-decision.pdf"],
            },
            repository_rights: { path: "LICENSE", sha256: sha256(rightsBytes) },
            package_metadata: { license: "Apache-2.0" },
            release_rights: {
              tag: "v0.1.0",
              commit_sha: "a".repeat(40),
              sbom: digestArtifact(root, "artifacts/release/noema.cdx.json", releaseBytes),
              dependency_license_inventory: digestArtifact(
                root,
                "artifacts/release/dependency-licenses.json",
                releaseBytes,
              ),
              notice: digestArtifact(root, "artifacts/release/NOTICE.txt", releaseBytes),
              provenance: digestArtifact(
                root,
                "artifacts/release/provenance.sigstore.json",
                releaseBytes,
              ),
              artifact_rights_metadata: artifactRightsBinding,
            },
            contributor_ip: {
              ownership_evidence: ["legal/contributor-ownership-register.pdf"],
              assignment_evidence: ["legal/ip-assignment-register.pdf"],
            },
          },
        }, null, 2)}\n`,
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
          NOEMA_TRANSFER_EVIDENCE_PATH: transferPath,
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
      expect(transferCheck.details.licensingIpFailures).toContain(
        "release_rights.artifact_rights_metadata must not contain duplicate JSON object keys",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
