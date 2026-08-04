import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  MAX_REPORT_BYTES,
  main,
  normalizeCommercialReadinessEvidence,
} from "../scripts/normalize-commercial-readiness-evidence.mjs";

const repository = "ContextualWisdomLab/noema";
const fixedNow = new Date("2026-08-04T11:15:00.000Z");
const originalReportPath = process.env.REPORT_PATH;
const originalExitCode = process.exitCode;
const temporaryDirectories: string[] = [];

function validReport() {
  return {
    schemaVersion: 1,
    repository,
    generatedAt: "2026-08-04T11:14:00.000Z",
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
            code: "noema_current_head_approval_missing",
            detail: "No current-head Noema approval exists.",
          },
        ],
      },
    ],
  };
}

function normalize(value: unknown) {
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  return normalizeCommercialReadinessEvidence(Buffer.from(raw), {
    expectedRepository: repository,
    now: () => fixedNow,
  });
}

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "noema-evidence-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  if (originalReportPath === undefined) {
    delete process.env.REPORT_PATH;
  } else {
    process.env.REPORT_PATH = originalReportPath;
  }
  process.exitCode = originalExitCode;
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop()!, { force: true, recursive: true });
  }
});

describe("commercial-readiness evidence normalization", () => {
  it("canonicalizes a realistic no-write pull-request report", () => {
    const report = validReport();
    const result = normalize({ ...report, ignoredField: "not retained" });

    expect(result.valid).toBe(true);
    expect(result.report).toEqual(report);
    expect(result.content).toBe(`${JSON.stringify(report, null, 2)}\n`);
    expect(Buffer.byteLength(result.content)).toBeLessThanOrEqual(MAX_REPORT_BYTES);
  });

  it.each([
    ["malformed JSON", "{not-json"],
    ["wrong schema version", { ...validReport(), schemaVersion: 2 }],
    ["wrong repository", { ...validReport(), repository: "outside/repository" }],
    ["write-enabled report", { ...validReport(), apply: true }],
    ["invalid generated timestamp", { ...validReport(), generatedAt: "not-a-date" }],
    [
      "noncanonical generated timestamp",
      { ...validReport(), generatedAt: "August 4, 2026 11:14:00 UTC" },
    ],
    ["negative pull-request count", { ...validReport(), openPullRequestCount: -1 }],
    ["missing results", { ...validReport(), results: null }],
    [
      "unbounded result detail",
      {
        ...validReport(),
        results: [{ number: 62, result: "blocked", detail: "x".repeat(1_001), reasons: [] }],
      },
    ],
    [
      "invalid reason code",
      {
        ...validReport(),
        results: [
          {
            number: 62,
            result: "blocked",
            reasons: [{ code: "Not Snake Case", detail: "invalid" }],
          },
        ],
      },
    ],
    [
      "control character in persisted detail",
      {
        ...validReport(),
        results: [
          {
            number: 62,
            result: "blocked",
            reasons: [{ code: "blocked_reason", detail: "unsafe\u0000detail" }],
          },
        ],
      },
    ],
  ])("replaces %s with fixed fail-closed evidence", (_label, input) => {
    const result = normalize(input);

    expect(result.valid).toBe(false);
    expect(result.report).toEqual({
      schemaVersion: 1,
      repository,
      generatedAt: fixedNow.toISOString(),
      apply: false,
      openPullRequestCount: null,
      remainingOpenPullRequestCount: null,
      results: [
        {
          number: null,
          result: "operational_error",
          reasons: [
            {
              code: "dry_run_report_invalid",
              detail:
                "Dry-run evidence failed size, syntax, or schema validation and was replaced before artifact upload.",
            },
          ],
        },
      ],
    });
    expect(result.content).not.toContain("not-json");
    expect(result.content).not.toContain("unsafe");
  });

  it("rejects an oversized report before JSON parsing", () => {
    const result = normalizeCommercialReadinessEvidence(
      Buffer.alloc(MAX_REPORT_BYTES + 1, 0x7b),
      {
        expectedRepository: repository,
        now: () => fixedNow,
      },
    );

    expect(result.valid).toBe(false);
    expect(result.report.results[0].reasons[0].code).toBe("dry_run_report_invalid");
    expect(Buffer.byteLength(result.content)).toBeLessThan(MAX_REPORT_BYTES);
  });

  it("retains every supported operational result shape", () => {
    const report = validReport();
    report.openPullRequestCount = 7;
    report.remainingOpenPullRequestCount = 6;
    report.results = [
      "blocked",
      "request_review",
      "merge",
      "review_in_progress",
      "review_dispatched",
      "merged",
      "operational_error",
    ].map((result, index) => ({
      number: index + 1,
      result,
      reasons: [],
      ...(result === "request_review" ? { decision: "request_review" } : {}),
      ...(result === "merged" ? { detail: "Squash-merged at a reviewed commit." } : {}),
    }));

    const normalized = normalize(report);

    expect(normalized.valid).toBe(true);
    expect(normalized.report).toEqual(report);
  });

  it("does not follow a predictable temporary-file symlink while replacing evidence", () => {
    const directory = createTemporaryDirectory();
    const reportPath = join(directory, "commercial-readiness.json");
    const protectedPath = join(directory, "protected.txt");
    const predictableTemporaryPath = `${reportPath}.${process.pid}.tmp`;
    const report = validReport();
    writeFileSync(reportPath, `${JSON.stringify(report)}\n`, "utf8");
    writeFileSync(protectedPath, "protected-sentinel\n", "utf8");
    symlinkSync(protectedPath, predictableTemporaryPath);
    process.env.REPORT_PATH = reportPath;
    process.exitCode = 0;

    const result = main();

    expect(result.valid).toBe(true);
    expect(readFileSync(protectedPath, "utf8")).toBe("protected-sentinel\n");
    expect(lstatSync(reportPath).isFile()).toBe(true);
    expect(lstatSync(reportPath).isSymbolicLink()).toBe(false);
  });
});
