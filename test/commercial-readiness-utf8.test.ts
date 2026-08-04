import { describe, expect, it } from "vitest";
import { normalizeCommercialReadinessEvidence } from "../scripts/normalize-commercial-readiness-evidence.mjs";

const expectedRepository = "ContextualWisdomLab/noema";
const generatedAt = "2026-08-04T12:30:00.000Z";

function reportPrefix(ignoredValueStart: string): Buffer {
  return Buffer.from(
    `{"schemaVersion":1,"repository":"${expectedRepository}","generatedAt":"${generatedAt}","apply":false,"openPullRequestCount":0,"remainingOpenPullRequestCount":0,"results":[],"ignored":"${ignoredValueStart}`,
    "utf8",
  );
}

function normalize(raw: Buffer) {
  return normalizeCommercialReadinessEvidence(raw, {
    expectedRepository,
    now: () => new Date("2026-08-04T12:31:00.000Z"),
  });
}

describe("commercial-readiness UTF-8 evidence boundary", () => {
  it("accepts valid international UTF-8 in an allowlist-dropped field", () => {
    const raw = Buffer.concat([
      reportPrefix("정상적인 국제화 증빙"),
      Buffer.from('"}', "utf8"),
    ]);

    const result = normalize(raw);

    expect(result.valid).toBe(true);
    expect(result.content).not.toContain("정상적인 국제화 증빙");
  });

  it("preserves valid international UTF-8 in an allowlisted reason detail", () => {
    const detail = "운영 검증 완료 — 증거가 현재 헤드와 일치합니다.";
    const raw = Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        repository: expectedRepository,
        generatedAt,
        apply: false,
        openPullRequestCount: 1,
        remainingOpenPullRequestCount: 1,
        results: [
          {
            number: 62,
            result: "blocked",
            reasons: [{ code: "review_required", detail }],
          },
        ],
      }),
      "utf8",
    );

    const result = normalize(raw);

    expect(result.valid).toBe(true);
    expect(result.report.results[0].reasons[0].detail).toBe(detail);
    expect(result.content).toContain(detail);
  });

  it("rejects malformed UTF-8 before replacement decoding can hide it", () => {
    const raw = Buffer.concat([
      reportPrefix(""),
      Buffer.from([0xc3, 0x28]),
      Buffer.from('"}', "utf8"),
    ]);

    const result = normalize(raw);

    expect(result.valid).toBe(false);
    expect(result.report.results[0].reasons[0].code).toBe("dry_run_report_invalid");
    expect(result.content).not.toContain("�");
  });
});
