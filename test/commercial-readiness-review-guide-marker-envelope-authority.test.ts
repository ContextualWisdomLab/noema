import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("commercial-readiness review-guide marker-envelope authority", () => {
  it("documents that any additional marker-like envelope makes the review non-authoritative", () => {
    const guide = readFileSync("docs/hourly-commercial-readiness-loop.md", "utf8");
    const start = guide.indexOf("## 리뷰와 head 결속");
    const end = guide.indexOf("## 권한 경계", start);
    const section = guide.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(section).toContain("marker-like envelope");
    expect(section).toContain("canonical marker가 정확히 하나여도");
    expect(section).toContain("authoritative Noema decision으로 인정하지 않습니다");
  });
});
