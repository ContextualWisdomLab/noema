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

  it("revalidates tracked buyer-evidence source before canonical audit generation", () => {
    const integrityIndex = workflow.indexOf(
      "      - name: verify tracked acquisition source before evidence generation",
    );
    const auditIndex = workflow.indexOf("      - name: run acquisition audit");

    expect(integrityIndex).toBeGreaterThan(-1);
    expect(auditIndex).toBeGreaterThan(integrityIndex);

    const integrityBlock = workflow.slice(integrityIndex, auditIndex);
    expect(integrityBlock).toContain("git status --porcelain=v1 --untracked-files=no");
    expect(integrityBlock).toContain('git rev-parse HEAD');
    expect(integrityBlock).toContain('github.sha');
    const nextStepIndex = workflow.indexOf("\n      - name:", auditIndex + 1);
    const auditBlock = workflow.slice(
      auditIndex,
      nextStepIndex === -1 ? workflow.length : nextStepIndex,
    );
    expect(auditBlock).toContain("npm run acquisition:audit");
  });

  it("fails closed when retained acquisition evidence is missing", () => {
    const uploadIndex = workflow.indexOf("      - name: upload acquisition artifacts");
    expect(uploadIndex).toBeGreaterThan(-1);
    const uploadBlock = workflow.slice(uploadIndex);
    expect(uploadBlock).toContain("if-no-files-found: error");
    expect(uploadBlock).not.toContain("if-no-files-found: warn");
  });
});
