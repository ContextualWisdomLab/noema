import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const DOCTORING_PATH = "docs/doctoring/2026-09-22-commercial-readiness-check-result-authority.md";
const DOCSTRING_DOCTORING_PATH = "docs/doctoring/2026-09-22-commercial-readiness-production-docstring-contract.md";

describe("commercial readiness Commit Status projection doctoring", () => {
  it("records the adapter-level exact identity repair separately from evaluator authority", () => {
    const resultAuthority = readFileSync(DOCTORING_PATH, "utf8");

    expect(resultAuthority).toContain("latestStatuses()");
    expect(resultAuthority).toContain("RED `8c04138e5553b6298b787d88670b280b51fc7c78`");
    expect(resultAuthority).toContain("GREEN `40d78034a5b100851ddde1c47f0d1add8de1edb1`");
    expect(resultAuthority).toContain("preserves exact Commit Status context/state identity before terminal merge-authority evaluation");
  });

  it("keeps the production docstring scope code-current at 38 authority-bearing functions", () => {
    const docstringAuthority = readFileSync(DOCSTRING_DOCTORING_PATH, "utf8");

    expect(docstringAuthority).toContain("38개 authority-bearing production 함수");
    expect(docstringAuthority).toContain("`latestStatuses()`");
    expect(docstringAuthority).toContain("`assertLiveHead()`");
    expect(docstringAuthority).toContain("scripts/hourly-commercial-readiness.mjs`: 20개");
    expect(docstringAuthority).toContain("scripts/lib/commercial-readiness-loop.mjs`: 9개");
    expect(docstringAuthority).toContain("scripts/lib/main-governance-audit.mjs`: 9개");
  });
});
