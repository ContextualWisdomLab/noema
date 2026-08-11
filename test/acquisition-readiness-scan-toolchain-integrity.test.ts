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
      "uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2",
    );
    expect(workflow).not.toMatch(
      /uses:\s+actions\/(?:checkout|setup-node|upload-artifact)@v\d+/,
    );
  });

  it("uses exact Node/npm identities and frozen install semantics", () => {
    expect(workflow).toContain('node-version: "24.19.0"');
    expect(workflow).toContain('test "$(node --version)" = "v24.19.0"');
    expect(workflow).toContain('test "$(npm --version)" = "11.17.0"');
    expect(workflow).toContain(
      "npm ci --legacy-peer-deps=false --install-links=false",
    );
    expect(workflow).not.toContain('node-version: "24"');
    expect(workflow).not.toMatch(/run:\s+npm ci\s*(?:\n|$)/);
  });

  it("revalidates tracked buyer-evidence source after npm lifecycle execution", () => {
    const installIndex = workflow.indexOf("      - name: install");
    const integrityIndex = workflow.indexOf(
      "      - name: verify tracked acquisition source unchanged after install",
    );
    const manifestIndex = workflow.indexOf("      - name: build data-room manifest");

    expect(installIndex).toBeGreaterThan(-1);
    expect(integrityIndex).toBeGreaterThan(installIndex);
    expect(manifestIndex).toBeGreaterThan(integrityIndex);

    const integrityBlock = workflow.slice(integrityIndex, manifestIndex);
    expect(integrityBlock).toContain("git status --porcelain=v1 --untracked-files=no");
    expect(integrityBlock).toContain('git rev-parse HEAD');
    expect(integrityBlock).toContain('github.sha');
  });
});
