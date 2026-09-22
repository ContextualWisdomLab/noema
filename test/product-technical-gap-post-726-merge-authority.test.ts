import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const baseline = () => readFileSync("docs/product-technical-gap-baseline.md", "utf8");

/**
 * Guards the active commercial index after #726 became protected history.
 * Historical prose may retain predecessor SHAs, but the active authority must
 * not continue presenting a merged lane as open or bind #730 to its old base.
 */
describe("post-726 protected authority convergence", () => {
  it("binds active authority to the new protected main and remaining open lanes", () => {
    const text = baseline();
    const activeStart = text.indexOf("## Current open-lane authority — 2026-09-22 KST");
    const activeEnd = text.indexOf("\n## Evidence and merge rules", activeStart);
    const active = text.slice(activeStart, activeEnd);

    expect(text).toContain("main@ca32ae2eb8c5ce73af2769d6a58a7ac714503251");
    expect(text).toContain("PR #726 GitHub-verified normal merge `ca32ae2eb8c5ce73af2769d6a58a7ac714503251`");
    expect(active).not.toContain("#726 current exact");
    expect(active).toContain("#729 is this sole documentation-authority lane");
    expect(active).toContain("#730 current exact `f8bf13702838131bcc586757348ef4a74564d9a1`");
    expect(active).not.toContain("#730 current exact `4bc5743b2fbf0055fb9889bd7af89d9789a833ef`");
    expect(active).toContain("requires repository workflow URL id to equal the workflow run's `workflow_id`");
    expect(active).toContain("requires exact check status/conclusion enum authority without whitespace or case normalization");
  });

  it("moves private-reporting source ownership from candidate to protected history", () => {
    const text = baseline();
    const row = text.split("\n").find((line) => line.startsWith("| P0 | Private vulnerability reporting operational evidence |"));

    expect(row).toContain("protected #722 + #723 + #724 + #726 / issue #73");
    expect(row).not.toContain("candidate #726");
    expect(row).not.toContain("#726 current-head independent review 종료 후 normal merge 검토");
    expect(row).toContain("#73에서 fresh protected receipt");
  });

  it("binds governance candidate to the ordinary restack on the current protected main", () => {
    const text = baseline();
    const row = text.split("\n").find((line) => line.startsWith("| P0 | Protected-main governance closure |"));

    expect(row).toContain("candidate #730 exact `f8bf13702838131bcc586757348ef4a74564d9a1`");
    expect(row).not.toContain("candidate #730 exact `4bc5743b2fbf0055fb9889bd7af89d9789a833ef`");
    expect(row).toContain("repository workflow URL/workflow_id identity consistency");
    expect(row).toContain("exact check status/conclusion authority");
  });
});
