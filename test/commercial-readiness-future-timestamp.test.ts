import { describe, expect, it } from "vitest";
import { normalizeCommercialReadinessEvidence } from "../scripts/normalize-commercial-readiness-evidence.mjs";

const repository = "ContextualWisdomLab/noema";
const observedAt = new Date("2026-08-22T15:20:00.000Z");

function normalize(generatedAt: string) {
  const raw = Buffer.from(JSON.stringify({
    schemaVersion: 1,
    repository,
    generatedAt,
    apply: false,
    openPullRequestCount: 0,
    remainingOpenPullRequestCount: 0,
    results: [],
  }));

  return normalizeCommercialReadinessEvidence(raw, {
    expectedRepository: repository,
    now: () => observedAt,
  });
}

describe("commercial-readiness evidence timestamp authority", () => {
  it("rejects canonical evidence timestamps that are later than the verifier clock", () => {
    const result = normalize("2026-08-22T15:20:00.001Z");

    expect(result.valid).toBe(false);
    expect(result.report.generatedAt).toBe(observedAt.toISOString());
    expect(result.report.results[0].reasons[0].code).toBe("dry_run_report_invalid");
  });
});
