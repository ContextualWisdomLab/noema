import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("commercial-readiness review-guide credential-position authority", () => {
  it("documents that only the marker-adjacent publisher credential can authorize a Noema gate", () => {
    const guide = readFileSync("docs/hourly-commercial-readiness-loop.md", "utf8");
    const start = guide.indexOf("## 리뷰와 head 결속");
    const end = guide.indexOf("## 권한 경계", start);
    const section = guide.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(section).toContain("marker 바로 앞");
    expect(section).toContain("앞선 본문에 같은 credential 문자열이 있어도");
    expect(section).toContain("authoritative Noema decision으로 인정하지 않습니다");
  });
});
