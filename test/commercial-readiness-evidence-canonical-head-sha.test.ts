import { describe, expect, it } from "vitest";
import { normalizeCommercialReadinessEvidence } from "../scripts/normalize-commercial-readiness-evidence.mjs";

const now = () => new Date("2026-08-23T00:00:00.000Z");

function reportWithHeadSha(headSha: string) {
  return Buffer.from(JSON.stringify({
    schemaVersion: 1,
    repository: "ContextualWisdomLab/noema",
    generatedAt: "2026-08-22T00:00:00.000Z",
    apply: false,
    openPullRequestCount: 1,
    remainingOpenPullRequestCount: 1,
    results: [{
      number: 463,
      headSha,
      result: "blocked",
      reasons: [],
    }],
  }), "utf8");
}

describe("commercial-readiness retained head identity", () => {
  it.each([
    "A".repeat(40),
    `${"a".repeat(39)}A`,
  ])("rejects non-canonical head SHA casing %s instead of normalizing it", (headSha) => {
    const normalized = normalizeCommercialReadinessEvidence(reportWithHeadSha(headSha), { now });

    expect(normalized.valid).toBe(false);
    expect(normalized.report.results).toEqual([
      {
        number: null,
        result: "operational_error",
        reasons: [
          {
            code: "dry_run_report_invalid",
            detail: "Dry-run evidence failed size, syntax, or schema validation and was replaced before artifact upload.",
          },
        ],
      },
    ]);
  });
});
