import { describe, expect, it } from "vitest";
import { normalizeCommercialReadinessEvidence } from "../scripts/normalize-commercial-readiness-evidence.mjs";

const repository = "ContextualWisdomLab/noema";
const fixedNow = new Date("2026-08-04T12:30:00.000Z");

function validReport(detail = "No blocking finding remains.") {
  return {
    schemaVersion: 1,
    repository,
    generatedAt: "2026-08-04T12:29:00.000Z",
    apply: false,
    openPullRequestCount: 1,
    remainingOpenPullRequestCount: 1,
    results: [
      {
        number: 62,
        headSha: "a".repeat(40),
        decision: "blocked",
        result: "blocked",
        reasons: [
          {
            code: "review_required",
            detail,
          },
        ],
      },
    ],
  };
}

function normalize(raw: Buffer) {
  return normalizeCommercialReadinessEvidence(raw, {
    expectedRepository: repository,
    now: () => fixedNow,
  });
}

describe("commercial-readiness evidence UTF-8 boundary", () => {
  it("rejects malformed UTF-8 even when it occurs only in an ignored field", () => {
    const marker = "malformed-byte-marker";
    const source = JSON.stringify({
      ...validReport(),
      ignoredDiagnostic: marker,
    });
    const markerOffset = source.indexOf(marker);
    expect(markerOffset).toBeGreaterThan(-1);
    const raw = Buffer.concat([
      Buffer.from(source.slice(0, markerOffset), "utf8"),
      Buffer.from([0xc3, 0x28]),
      Buffer.from(source.slice(markerOffset + marker.length), "utf8"),
    ]);

    const result = normalize(raw);

    expect(result.valid).toBe(false);
    expect(result.report.results[0].reasons[0].code).toBe(
      "dry_run_report_invalid",
    );
    expect(result.content).not.toContain("ignoredDiagnostic");
    expect(result.content).not.toContain("malformed-byte-marker");
  });

  it("retains valid non-ASCII UTF-8 in an allowlisted reason detail", () => {
    const detail = "운영 검증 완료 — 증거가 현재 헤드와 일치합니다.";

    const result = normalize(Buffer.from(JSON.stringify(validReport(detail)), "utf8"));

    expect(result.valid).toBe(true);
    expect(result.report.results[0].reasons[0].detail).toBe(detail);
    expect(result.content).toContain(detail);
  });
});
