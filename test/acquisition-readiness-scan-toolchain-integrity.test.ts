import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  ".github/workflows/acquisition-readiness-scan.yml",
  "utf8",
);

describe("acquisition-readiness workflow supply-chain integrity", () => {
  it("pins trusted actions and refuses persisted checkout credentials", () => {
    expect(workflow).toContain(
      "uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2",
    );
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).toContain(
      "uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6.4.0",
    );
    expect(workflow).toContain(
      "uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1",
    );
    expect(workflow).not.toContain(
      "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
    );
    expect(workflow).not.toMatch(
      /uses:\s+actions\/(?:checkout|setup-node|upload-artifact)@v\d+/,
    );
  });

  it("uses exact Node/npm identities without installing dependency code", () => {
    expect(workflow).toContain('node-version: "24.19.0"');
    expect(workflow).toContain('test "$(node --version)" = "v24.19.0"');
    expect(workflow).toContain('test "$(npm --version)" = "11.17.0"');
    expect(workflow).not.toContain('node-version: "24"');
    expect(workflow).not.toMatch(/\bnpm\s+(?:ci|install|i)\b/);
    expect(workflow).not.toContain("      - name: install");
  });

  it("revalidates tracked buyer-evidence source before evidence generation", () => {
    const integrityIndex = workflow.indexOf(
      "      - name: verify tracked acquisition source before evidence generation",
    );
    const manifestIndex = workflow.indexOf("      - name: build data-room manifest");

    expect(integrityIndex).toBeGreaterThan(-1);
    expect(manifestIndex).toBeGreaterThan(integrityIndex);

    const integrityBlock = workflow.slice(integrityIndex, manifestIndex);
    expect(integrityBlock).toContain("git status --porcelain=v1 --untracked-files=no");
    expect(integrityBlock).toContain('git rev-parse HEAD');
    expect(integrityBlock).toContain('github.sha');
  });

  it("fails closed when retained acquisition evidence is missing", () => {
    const uploadIndex = workflow.indexOf("      - name: upload acquisition artifacts");
    expect(uploadIndex).toBeGreaterThan(-1);
    const uploadBlock = workflow.slice(uploadIndex);
    expect(uploadBlock).toContain("if-no-files-found: error");
    expect(uploadBlock).not.toContain("if-no-files-found: warn");
  });
});
