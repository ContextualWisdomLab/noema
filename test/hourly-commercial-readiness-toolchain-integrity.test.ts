import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  ".github/workflows/hourly-commercial-readiness.yml",
  "utf8",
);

describe("commercial writer toolchain integrity", () => {
  it("uses the exact protected-CI Node/npm execution contract", () => {
    expect(workflow).toContain(
      "uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6.4.0",
    );
    expect(workflow).toContain('node-version: "24.19.0"');
    expect(workflow).toContain('test "$(node --version)" = "v24.19.0"');
    expect(workflow).toContain('test "$(npm --version)" = "11.17.0"');
    expect(workflow).toContain(
      "npm ci --legacy-peer-deps=false --install-links=false",
    );
    expect(workflow).not.toContain('node-version: "24"');
    expect(workflow).not.toMatch(/run:\s+npm ci\s*(?:\n|$)/);
  });

  it("retains credential isolation and bounded maintainer authority", () => {
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).toContain(
      "uses: actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1 # v3.2.0",
    );
    expect(workflow).toContain("GH_TOKEN: ${{ steps.maintainer_app.outputs.token }}");
    expect(workflow).not.toContain("GH_TOKEN: ${{ github.token }}");
  });
});
