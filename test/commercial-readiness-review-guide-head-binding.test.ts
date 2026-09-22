import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const REVIEW_HEADING = "## 리뷰와 head 결속";
const NEXT_HEADING = "## 권한 경계";

function reviewSection(guide: string) {
  const start = guide.indexOf(REVIEW_HEADING);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = guide.indexOf(NEXT_HEADING, start + REVIEW_HEADING.length);
  expect(end).toBeGreaterThan(start);
  return guide.slice(start, end);
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
});
