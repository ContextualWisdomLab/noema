import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("CI release evidence ordering", () => {
  it("materializes dependency license evidence before the acquisition manifest", () => {
    const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
    const inventoryStep = workflow.indexOf(
      "      - name: release dependency license inventory\n        run: npm run release:dependency-license-inventory",
    );
    const manifestStep = workflow.indexOf(
      "      - name: release acquisition manifest\n        run: npm run acquisition:manifest",
    );

    expect(inventoryStep).toBeGreaterThanOrEqual(0);
    expect(manifestStep).toBeGreaterThan(inventoryStep);
  });

  it("emits actionable branch diagnostics when coverage fails without uncovered statements", () => {
    const workflow = readFileSync(".github/workflows/ci.yml", "utf8");

    expect(workflow).toContain("const branchMap = coverage?.branchMap ?? {};");
    expect(workflow).toContain("for (const [branchId, hits] of Object.entries(coverage?.b ?? {}))");
    expect(workflow).toContain("const line = branch?.line ?? branch?.loc?.start?.line ?? location?.line ?? location?.start?.line;");
    expect(workflow).toContain("if (!Number.isInteger(line)) continue;");
    expect(workflow).toContain("Uncovered branch ${path}:${line}:${column}");
  });
});
