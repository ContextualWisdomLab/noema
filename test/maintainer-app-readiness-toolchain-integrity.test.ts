import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  ".github/workflows/maintainer-app-readiness.yml",
  "utf8",
);

describe("maintainer App readiness runtime integrity", () => {
  it("uses the exact protected-CI Node runtime before repository scripts execute", () => {
    expect(workflow).toContain(
      "uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6.4.0",
    );
    expect(workflow).toContain('node-version: "24.19.0"');
    expect(workflow).toContain('test "$(node --version)" = "v24.19.0"');

    const verifyIndex = workflow.indexOf('test "$(node --version)" = "v24.19.0"');
    const governanceIndex = workflow.indexOf("node scripts/main-governance-audit.mjs");
    const readinessIndex = workflow.indexOf("node scripts/maintainer-app-readiness.mjs");
    const normalizeIndex = workflow.indexOf(
      "node scripts/normalize-commercial-readiness-evidence.mjs",
    );

    expect(verifyIndex).toBeGreaterThan(-1);
    expect(governanceIndex).toBeGreaterThan(verifyIndex);
    expect(readinessIndex).toBeGreaterThan(verifyIndex);
    expect(normalizeIndex).toBeGreaterThan(verifyIndex);
    expect(workflow).not.toContain('node-version: "24"');
  });

  it("does not add dependency installation to the credentialed preflight", () => {
    expect(workflow).not.toContain("npm ci");
    expect(workflow).not.toContain("npm install");
    expect(workflow).not.toContain("npm run");
  });
});
