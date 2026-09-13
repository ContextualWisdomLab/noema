import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("protected procedural current-lifecycle deadline documentation authority", () => {
  it("records protected #699 without promoting Workflow / Task or production authority", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");
    const changelog = readFileSync("CHANGELOG.md", "utf8");
    const source = readFileSync("src/agent-runtime/procedural-current-lifecycle.ts", "utf8");

    expect(changelog).toContain("Protected #699");
    expect(changelog).toContain("e52408745efc73351c098227ae4c85c309fdd0c9");
    expect(changelog).toContain("10-second absolute read deadline");
    expect(baseline).toContain(
      "merged PR #699 exact `e52408745efc73351c098227ae4c85c309fdd0c9`",
    );
    expect(baseline).toContain("10-second absolute read deadline");
    expect(baseline).toContain("stable `invalid_workflow_state_response`");
    expect(baseline).toContain("best-effort cleanup");
    expect(baseline).toContain("reader lock");
    expect(baseline).toContain("immutable release");
    expect(baseline).not.toContain("#699 transfers Workflow / Task lifecycle authority to Agent Runtime");
    expect(source).toContain("CURRENT_WORKFLOW_RESPONSE_READ_DEADLINE_MS = 10_000");
    expect(source).toContain("Noema current workflow-state response exceeded read deadline");
  });
});
