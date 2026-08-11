import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/readiness-scan.yml", "utf8");

describe("saleable-readiness workflow supply-chain integrity", () => {
  it("pins every third-party action used by the workflow", () => {
    expect(workflow).toContain(
      "uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2",
    );
    expect(workflow).toContain(
      "uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6.4.0",
    );
    expect(workflow).toContain(
      "uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2",
    );
    expect(workflow).not.toMatch(/uses:\s+actions\/(?:checkout|setup-node|upload-artifact)@v\d+/);
  });

  it("does not persist the workflow token in the checkout", () => {
    expect(workflow).toContain("persist-credentials: false");
  });

  it("uses the exact protected-CI Node/npm identities and frozen install flags", () => {
    expect(workflow).toContain('node-version: "24.19.0"');
    expect(workflow).toContain('test "$(node --version)" = "v24.19.0"');
    expect(workflow).toContain('test "$(npm --version)" = "11.17.0"');
    expect(workflow).toContain(
      "npm ci --legacy-peer-deps=false --install-links=false",
    );
    expect(workflow).not.toMatch(/run:\s+npm ci\s*(?:\n|$)/);
    expect(workflow).not.toContain('node-version: "24"');
  });

  it("fails closed when retained readiness evidence is missing", () => {
    const uploadIndex = workflow.indexOf("      - name: upload readiness artifacts");
    expect(uploadIndex).toBeGreaterThan(-1);
    const uploadBlock = workflow.slice(uploadIndex);
    expect(uploadBlock).toContain("if-no-files-found: error");
    expect(uploadBlock).not.toContain("if-no-files-found: warn");
  });
});
