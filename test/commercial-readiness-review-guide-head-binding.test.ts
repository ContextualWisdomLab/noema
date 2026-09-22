import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const REVIEW_HEADING = "## 리뷰와 head 결속";
const NEXT_HEADING = "## 권한 경계";
const APPROVAL_MAPPING = "`approve`는 정확한 `APPROVED`";
const BLOCKING_MAPPING = "`request_changes`와 `blocked`는 정확한 `CHANGES_REQUESTED`";
const INVALID_STATE_BOUNDARY =
  "`state` 누락·소문자·incompatible 값이나 marker decision과 맞지 않는 state는 current-head decision으로 인정하지 않습니다.";

function reviewSection(guide: string) {
  const start = guide.indexOf(REVIEW_HEADING);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = guide.indexOf(NEXT_HEADING, start + REVIEW_HEADING.length);
  expect(end).toBeGreaterThan(start);
  return guide.slice(start, end);
}

function hasExactReviewStateMappings(section: string): boolean {
  return section.includes(APPROVAL_MAPPING)
    && section.includes(BLOCKING_MAPPING)
    && section.includes(INVALID_STATE_BOUNDARY);
}

describe("commercial-readiness review guide head binding", () => {
  it("documents GitHub review commit identity as mandatory merge authority", () => {
    const guide = readFileSync("docs/hourly-commercial-readiness-loop.md", "utf8");
    const section = reviewSection(guide);

    expect(section).toContain("GitHub review `commit_id`");
    expect(section).toContain("exact current head");
    expect(section).toContain("누락·malformed·다른 SHA");
    expect(section).toContain("authoritative Noema decision");
    expect(guide).toContain("`noema_current_head_approval_missing`");
    expect(guide).toContain("GitHub `commit_id`가 exact current head인지");
  });

  it("binds each Noema marker decision to its exact GitHub review state", () => {
    const guide = readFileSync("docs/hourly-commercial-readiness-loop.md", "utf8");
    const section = reviewSection(guide);

    expect(section).toContain("GitHub review `state`");
    expect(hasExactReviewStateMappings(section)).toBe(true);
    expect(guide).toContain("marker decision과 GitHub review `state`");
  });

  it("rejects swapped or missing marker-to-state mappings in the executable guide contract", () => {
    const guide = readFileSync("docs/hourly-commercial-readiness-loop.md", "utf8");
    const section = reviewSection(guide);
    const swapped = section
      .replace(APPROVAL_MAPPING, "`approve`는 정확한 `CHANGES_REQUESTED`")
      .replace(BLOCKING_MAPPING, "`request_changes`와 `blocked`는 정확한 `APPROVED`");
    const missingBlockingMapping = section.replace(BLOCKING_MAPPING, "");

    expect(hasExactReviewStateMappings(swapped)).toBe(false);
    expect(hasExactReviewStateMappings(missingBlockingMapping)).toBe(false);
  });
});