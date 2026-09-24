import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("commercial readiness operator workflow-provenance contract", () => {
  it("documents the complete fail-closed required-check provenance tuple", () => {
    const guide = readFileSync("docs/hourly-commercial-readiness-loop.md", "utf8");
    const start = guide.indexOf("## 필수 병합 근거");
    const end = guide.indexOf("## 리뷰와 head 결속", start);
    const section = guide.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(section).toContain("App id `15368`");
    expect(section).toContain("check_suite.id");
    expect(section).toContain("check_suite_id");
    expect(section).toContain("event=pull_request");
    expect(section).toContain("pull_requests");
    expect(section).toContain("head_sha");
    expect(section).toContain("base.ref=main");
    expect(section).toContain("base.sha");
    expect(section).toContain(".github/workflows/ci.yml");
    expect(section).toContain(".github/workflows/reviewer-ci.yml");
    expect(section).toContain(".github/workflows/security-scan.yml");
    expect(section).toContain("repository_workflow");
    expect(section).toContain("required_workflow");
    expect(section).toContain("Target repository의 `/actions/workflows/<id>` URL의 `<id>`와 동일한 workflow-run `workflow_id`");
    expect(section).toContain("self-modified-workflow");
    expect(section).toContain("untrusted-workflow");
    expect(section).toContain("changed_files");
    expect(section).toContain("operational_error");
    expect(section).toContain("ContextualWisdomLab/.github");
    expect(section).toContain("repository id `1274066402`");
    expect(section).toContain("refs/heads/main");
  });

  it("keeps the required-check operator diagnostic aligned with fail-closed provenance", () => {
    const guide = readFileSync("docs/hourly-commercial-readiness-loop.md", "utf8");
    const start = guide.indexOf("## 운영 점검");
    const section = guide.slice(start);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(section).toContain("`required_check_missing`");
    expect(section).toContain("App id `15368`");
    expect(section).toContain("`check_suite.id` / `check_suite_id`");
    expect(section).toContain("PR/head/base");
    expect(section).toContain("canonical workflow path/source");
    expect(section).toContain("URL id/`workflow_id`");
    expect(section).toContain("`changed_files`");
    expect(section).toContain("`self-modified-workflow`");
  });
});
