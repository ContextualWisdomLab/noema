import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const guide = readFileSync("docs/hourly-commercial-readiness-loop.md", "utf8");

const UNCREENTIALED_SUCCESSOR_RULE =
  "later canonical gate marker가 credential을 잃었거나 trusted exact-head review가 `DISMISSED`이면 이전 approval authority가 취소된 상태";
const ORDINARY_COMMENT_RULE =
  "credential과 canonical gate marker가 모두 없는 ordinary review comment는 기존 Noema gate decision을 변경하지 않습니다";

describe("commercial-readiness review-guide credential successor authority", () => {
  it("keeps uncredentialed gate successors fail closed without revoking on ordinary comments", () => {
    expect(guide).toContain(UNCREENTIALED_SUCCESSOR_RULE);
    expect(guide).toContain(ORDINARY_COMMENT_RULE);
  });
});
