import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function runManifest(outputDir: string) {
  return spawnSync("node", ["scripts/acquisition-data-room-manifest.mjs"], {
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
      const acquisitionWorkflow = manifest.entries.find((entry: { id: string }) => entry.id === "acquisition-scan-workflow");
      const revenueEvidence = manifest.entries.find((entry: { id: string }) => entry.id === "revenue-evidence");

      expect(manifest.passed).toBe(true);
      expect(manifest.finalGatePassed).toBe(false);
      expect(manifest.missingFinalGate).toContain("production-kpi-log");
      expect(manifest.missingFinalGate).toContain("revenue-evidence");
      expect(readme.status).toBe("present");
      expect(readme.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(pitchOutline.status).toBe("present");
      expect(transferPlan.status).toBe("present");
      expect(acquisitionWorkflow.status).toBe("present");
      expect(revenueEvidence.required).toBe(false);
      expect(revenueEvidence.requiredForFinalGate).toBe(true);
      expect(revenueEvidence.validatedBy).toBe("npm run acquisition:audit");
      expect(revenueEvidence.statusMeaning).toContain("file presence only");
      expect(revenueEvidence.status).toBe("missing");
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });
});
