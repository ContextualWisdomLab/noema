import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function runManifest(outputDir: string) {
  return spawnSync(process.execPath, ["scripts/acquisition-data-room-manifest.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NOEMA_DATA_ROOM_OUTPUT_DIR: outputDir,
    },
    encoding: "utf8",
  });
}

describe("acquisition-data-room-manifest", () => {
  it("writes a buyer data-room manifest with hashes and final-gate gaps", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-data-room-"));
    try {
      const result = runManifest(temp);
      const manifestPath = join(temp, "data-room-manifest.json");

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("acquisition-data-room-manifest: PASS");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      const readme = manifest.entries.find((entry: { id: string }) => entry.id === "product-readme");
      const pitchOutline = manifest.entries.find((entry: { id: string }) => entry.id === "buyer-pitch-outline");
      const transferPlan = manifest.entries.find((entry: { id: string }) => entry.id === "transfer-readiness-plan");
      const productionPreflight = manifest.entries.find((entry: { id: string }) => entry.id === "production-preflight-script");
      const acquisitionWorkflow = manifest.entries.find((entry: { id: string }) => entry.id === "acquisition-scan-workflow");
      const releaseSupplyChain = manifest.entries.find((entry: { id: string }) => entry.id === "release-supply-chain");
      const releaseEvidenceScript = manifest.entries.find((entry: { id: string }) => entry.id === "release-evidence-script");
      const releaseEvidenceWorkflow = manifest.entries.find((entry: { id: string }) => entry.id === "release-evidence-workflow");
      const releaseEvidenceTests = manifest.entries.find((entry: { id: string }) => entry.id === "release-evidence-tests");
      const releaseEvidenceBuild = manifest.entries.find((entry: { id: string }) => entry.id === "release-evidence-build");
      const deploymentProvenance = manifest.entries.find((entry: { id: string }) => entry.id === "deployment-provenance");
      const deploymentWorkflow = manifest.entries.find((entry: { id: string }) => entry.id === "production-deployment-workflow");
      const deploymentAudit = manifest.entries.find((entry: { id: string }) => entry.id === "deployment-evidence-audit");
      const deploymentVerify = manifest.entries.find((entry: { id: string }) => entry.id === "deployment-evidence-verify");
      const attestationVerify = manifest.entries.find((entry: { id: string }) => entry.id === "deployment-attestation-verify");
      const deploymentEvidence = manifest.entries.find((entry: { id: string }) => entry.id === "production-deployment-evidence");
      const deploymentAttestation = manifest.entries.find((entry: { id: string }) => entry.id === "production-deployment-attestation");
      const deploymentVerification = manifest.entries.find((entry: { id: string }) => entry.id === "deployment-attestation-verification");
      const productionGovernance = manifest.entries.find((entry: { id: string }) => entry.id === "production-environment-governance");
      const pilotLog = manifest.entries.find((entry: { id: string }) => entry.id === "pilot-log");
      const securityChecklistParser = manifest.entries.find((entry: { id: string }) => entry.id === "security-checklist-parser");
      const sourceIdHelper = manifest.entries.find((entry: { id: string }) => entry.id === "source-id-helper");
      const securityEvidenceTemplate = manifest.entries.find((entry: { id: string }) => entry.id === "security-evidence-template");
      const securityEvidenceValidator = manifest.entries.find((entry: { id: string }) => entry.id === "security-evidence-validator");
      const securityEvidenceVerify = manifest.entries.find((entry: { id: string }) => entry.id === "security-evidence-verify");
      const securityEvidence = manifest.entries.find((entry: { id: string }) => entry.id === "security-validation-evidence");
      const revenueTemplate = manifest.entries.find((entry: { id: string }) => entry.id === "revenue-evidence-template");
      const transferTemplate = manifest.entries.find((entry: { id: string }) => entry.id === "transfer-evidence-template");
      const revenueEvidence = manifest.entries.find((entry: { id: string }) => entry.id === "revenue-evidence");

      expect(manifest.passed).toBe(true);
      expect(manifest.finalGatePassed).toBe(false);
      expect(manifest.missingFinalGate).toContain("production-kpi-log");
      expect(manifest.missingFinalGate).toContain("production-deployment-evidence");
      expect(manifest.missingFinalGate).toContain("production-deployment-attestation");
      expect(manifest.missingFinalGate).toContain("deployment-attestation-verification");
      expect(manifest.missingFinalGate).toContain("production-environment-governance");
      expect(manifest.missingFinalGate).toContain("revenue-evidence");
      expect(readme.status).toBe("present");
      expect(readme.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(pitchOutline.status).toBe("present");
      expect(transferPlan.status).toBe("present");
      expect(productionPreflight.status).toBe("present");
      expect(acquisitionWorkflow.status).toBe("present");
      expect(releaseSupplyChain.status).toBe("present");
      expect(releaseSupplyChain.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(releaseEvidenceScript.status).toBe("present");
      expect(releaseEvidenceWorkflow.status).toBe("present");
      expect(releaseEvidenceTests.status).toBe("present");
      expect(releaseEvidenceBuild.command).toContain("npm run release:evidence");
      expect(deploymentProvenance.status).toBe("present");
      expect(deploymentWorkflow.status).toBe("present");
      expect(deploymentAudit.status).toBe("present");
      expect(deploymentVerify.command).toContain("acquisition:deployment-evidence");
      expect(attestationVerify.command).toContain("gh attestation verify deployment-evidence.json");
      expect(attestationVerify.command).toContain("--deny-self-hosted-runners");
      expect(deploymentEvidence.requiredForFinalGate).toBe(true);
      expect(deploymentEvidence.validatedBy).toBe("npm run acquisition:audit");
      expect(deploymentEvidence.status).toBe("missing");
      expect(deploymentAttestation.status).toBe("missing");
      expect(deploymentVerification.status).toBe("missing");
      expect(productionGovernance.status).toBe("missing");
      expect(pilotLog.validatedBy).toBe("npm run acquisition:audit");
      expect(pilotLog.statusMeaning).toContain("production pilot content");
      expect(securityChecklistParser.status).toBe("present");
      expect(sourceIdHelper.status).toBe("present");
      expect(securityEvidenceTemplate.status).toBe("present");
      expect(securityEvidenceValidator.status).toBe("present");
      expect(securityEvidenceVerify.command).toBe("npm run security:evidence");
      expect(securityEvidence.requiredForFinalGate).toBe(true);
      expect(securityEvidence.validatedBy).toBe("npm run security:evidence");
      expect(revenueTemplate.status).toBe("present");
      expect(transferTemplate.status).toBe("present");
      expect(revenueEvidence.required).toBe(false);
      expect(revenueEvidence.requiredForFinalGate).toBe(true);
      expect(revenueEvidence.validatedBy).toBe("npm run acquisition:audit");
      expect(revenueEvidence.statusMeaning).toContain("file presence only");
      expect(revenueEvidence.status).toBe("missing");
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("creates a custom manifest parent directory", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-data-room-custom-"));
    try {
      const manifestPath = join(temp, "nested", "custom", "manifest.json");
      const result = spawnSync(process.execPath, ["scripts/acquisition-data-room-manifest.mjs"], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NOEMA_DATA_ROOM_OUTPUT_DIR: join(temp, "out"),
          NOEMA_DATA_ROOM_MANIFEST_PATH: manifestPath,
        },
        encoding: "utf8",
      });

      expect(result.status).toBe(0);
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      expect(manifest.manifestPath).toBe(manifestPath);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });
});
