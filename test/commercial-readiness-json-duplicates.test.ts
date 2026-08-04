import { describe, expect, it } from "vitest";
import {
  hasDuplicateJsonObjectKeys,
  normalizeCommercialReadinessEvidence,
} from "../scripts/normalize-commercial-readiness-evidence.mjs";

const expectedRepository = "ContextualWisdomLab/noema";
const fixedNow = new Date("2026-08-04T12:15:00.000Z");

function normalizeRaw(raw: string) {
  return normalizeCommercialReadinessEvidence(Buffer.from(raw), {
    expectedRepository,
    now: () => fixedNow,
  });
}

describe("commercial-readiness JSON duplicate-key boundary", () => {
  it("accepts complete JSON grammar without confusing values or sibling keys for duplicates", () => {
    const raw = String.raw`{
      "schemaVersion": 1,
      "repository": "ContextualWisdomLab/noema",
      "generatedAt": "2026-08-04T12:14:00.000Z",
      "apply": false,
      "openPullRequestCount": 1,
      "remainingOpenPullRequestCount": 1,
      "results": [
        {
          "number": 62,
          "result": "blocked",
          "reasons": [
            {"code": "blocked_reason", "detail": "quoted \"key\" and braces {}"}
          ],
          "ignoredObject": {"sameKey": -1.25e+3},
          "ignoredSibling": {"sameKey": true},
          "ignoredValues": [false, null, "repository", [], {}]
        }
      ]
    }`;

    expect(hasDuplicateJsonObjectKeys(raw)).toBe(false);
    expect(normalizeRaw(raw).valid).toBe(true);
  });

  it.each([
    [
      "root duplicate",
      String.raw`{"schemaVersion":1,"schemaVersion":1,"repository":"ContextualWisdomLab/noema","generatedAt":"2026-08-04T12:14:00.000Z","apply":false,"openPullRequestCount":0,"remainingOpenPullRequestCount":0,"results":[]}`,
    ],
    [
      "nested duplicate",
      String.raw`{"schemaVersion":1,"repository":"ContextualWisdomLab/noema","generatedAt":"2026-08-04T12:14:00.000Z","apply":false,"openPullRequestCount":1,"remainingOpenPullRequestCount":1,"results":[{"number":62,"result":"blocked","reasons":[{"code":"first_code","code":"second_code","detail":"duplicate"}]}]}`,
    ],
    [
      "escaped equivalent duplicate",
      String.raw`{"schemaVersion":1,"repository":"ContextualWisdomLab/noema","reposit\u006fry":"other/repository","generatedAt":"2026-08-04T12:14:00.000Z","apply":false,"openPullRequestCount":0,"remainingOpenPullRequestCount":0,"results":[]}`,
    ],
    [
      "duplicate inside an array object",
      String.raw`[{"nested":1,"nested":2}]`,
    ],
  ])("rejects %s before JSON.parse can apply last-key-wins semantics", (_label, raw) => {
    expect(hasDuplicateJsonObjectKeys(raw)).toBe(true);
    const result = normalizeRaw(raw);

    expect(result.valid).toBe(false);
    expect(result.report.results[0].reasons[0].code).toBe("dry_run_report_invalid");
    expect(result.content).not.toContain("second_code");
    expect(result.content).not.toContain("other/repository");
  });

  it.each([
    ["non-string input", null],
    ["empty input", ""],
    ["missing object key", "{"],
    ["missing colon", String.raw`{"key" 1}`],
    ["missing value", String.raw`{"key":}`],
    ["missing object comma", String.raw`{"first":1 "second":2}`],
    ["missing array comma", String.raw`[1 2]`],
    ["dangling array comma", String.raw`[1,]`],
    ["trailing content", String.raw`{"key":1} trailing`],
    ["unterminated string", String.raw`{"key":"unterminated}`],
    ["invalid escape", String.raw`{"ke\q":"value"}`],
    ["unescaped control character", "{\"bad\nkey\":1}"],
    ["invalid primitive", String.raw`{"key":tru}`],
  ])("fails closed on %s", (_label, raw) => {
    expect(() => hasDuplicateJsonObjectKeys(raw as string)).toThrow();
  });

  it("bounds recursive JSON nesting", () => {
    const raw = `${"[".repeat(258)}null${"]".repeat(258)}`;

    expect(() => hasDuplicateJsonObjectKeys(raw)).toThrow(RangeError);
    expect(normalizeRaw(raw).valid).toBe(false);
  });
});
