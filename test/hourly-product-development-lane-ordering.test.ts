import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  ".github/workflows/hourly-product-development.yml",
  "utf8",
);

describe("hourly product-development lane ordering", () => {
  it("does not treat a newer dependency bump as an automatic successor", () => {
    expect(workflow).toContain(
      "list every live open pull request with its changed paths",
    );
    expect(workflow).toContain("a sole-writer document stays with its owner lane");
    expect(workflow).toContain(
      "A newer dependency bump is only a successor after its exact candidate independently verifies complete inheritance of every valid delta, test, fixture, contract, and evidence from the older lane",
    );
    expect(workflow).toContain(
      "Until that verification succeeds, keep both dependency lanes open and do not claim supersession",
    );
    expect(workflow).not.toContain(
      "a newer dependency bump supersedes an older one on the same package",
    );
  });

  it("blocks only real prerequisite authority instead of globally serializing path-isolated work", () => {
    expect(workflow).not.toContain(
      "a declared successor lane must not start source work before its predecessor docs lane reconverges to the current protected main",
    );
    expect(workflow).toContain(
      "Only when a successor's correctness or authority depends on another lane, wait for that prerequisite lane to reconverge to the current protected main",
    );
    expect(workflow).toContain(
      "Path-isolated work that consumes no mutable predecessor authority remains eligible",
    );
  });
});
