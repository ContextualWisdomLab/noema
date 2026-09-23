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
    expect(active).toContain("#730 current exact `3e7a631c25a8de78c9987181d1e7632c4b091638`");
    expect(active).not.toContain("#730 current exact `3c315332ba40230495bf4a57c3b6dee96b394992`");
    expect(active).toContain("requires repository workflow URL id to equal the workflow run's `workflow_id`");
    expect(active).toContain("requires exact canonical Noema decision token without whitespace or case normalization");
    expect(active).toContain("requires exact Noema-owned review marker serialization for `head_sha` and `decision` without case normalization");
    expect(active).toContain("requires exactly one marker-like Noema review envelope per trusted review body, requires that envelope to be the one canonical marker, and rejects additional malformed envelopes");
    expect(active).toContain("treats trusted exact-head `DISMISSED` review state as revocation and never falls back to an older Noema approval");
    expect(active).toContain("preserves generic reviewer-state projection while malformed credentialed exact-head Noema gate successors revoke prior approval");
    expect(active).toContain("revokes prior Noema approval when a later trusted exact-head canonical gate marker loses its reviewer credential while preserving ordinary review comments");
    expect(active).toContain("requires reviewer credential authority at the canonical marker-adjacent publisher position so earlier body echoes cannot mask a missing or different publisher credential");
    expect(active).toContain("revalidates the freshly evaluated base SHA immediately before the normal merge write");
    expect(active).toContain("requires exact Check Run status/conclusion and Commit Status state authority without whitespace or case normalization");
    expect(active).toContain("preserves exact Commit Status context/state identity before terminal merge-authority evaluation");
    expect(active).toContain("fails closed when same-suite retry chronology lacks parseable `started_at`/`completed_at` evidence");
    expect(active).toContain("fails closed when distinct same-suite retries have identical observed chronology instead of ordering by opaque Check Run ids");
    expect(active).toContain("executable guide contract independently rejects missing approval and missing blocking marker-to-state mappings");
    expect(active).toContain("100% 38-function authority-bearing production docstring scope contract");
    expect(active).toContain("hosted RED test-contract RCA preserves missing-approval versus explicit-rejection semantics, fail-closed missing retry chronology, and the 38-function direct-JSDoc gate without changing production merge authority");
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

    expect(row).toContain("candidate #730 exact `3e7a631c25a8de78c9987181d1e7632c4b091638`");
    expect(row).not.toContain("candidate #730 exact `3c315332ba40230495bf4a57c3b6dee96b394992`");
    expect(row).toContain("repository workflow URL/workflow_id identity consistency");
    expect(row).toContain("fail-closed unknown retry chronology");
    expect(row).toContain("fail-closed equal-timestamp retry ambiguity");
    expect(row).toContain("exact canonical Noema decision token authority");
    expect(row).toContain("exact Noema review marker serialization authority");
    expect(row).toContain("exact-one marker-like Noema review envelope authority");
    expect(row).toContain("trusted exact-head DISMISSED review revocation authority");
    expect(row).toContain("generic reviewer-state projection preservation authority");
    expect(row).toContain("uncredentialed canonical Noema gate successor revocation authority");
    expect(row).toContain("marker-adjacent reviewer credential authority");
    expect(row).toContain("fresh-evaluated base-SHA merge-write revalidation");
    expect(row).toContain("exact Check Run/Commit Status terminal result authority");
    expect(row).toContain("exact Commit Status collection projection identity");
    expect(row).toContain("independently rejects missing approval and missing blocking marker-to-state mappings");
    expect(row).toContain("100% 38-function authority-bearing production docstring scope contract");
  });
});
