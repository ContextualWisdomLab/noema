import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

describe("release publication receipt runtime handoff", () => {
  it("keeps the isolated handoff executable self-contained", () => {
    const receipt = readFileSync("scripts/release-publication-receipt.mjs", "utf8");
    const workflow = readFileSync(".github/workflows/release-evidence.yml", "utf8");

    expect(receipt).not.toMatch(/from\s+["']\.\//);
    expect(workflow).toContain(
      "install -m 0644 scripts/release-publication-receipt.mjs release-publication-receipt.mjs",
    );
    expect(workflow).toContain(
      'node "$BUNDLE_DIR/release-publication-receipt.mjs"',
    );
  });

  it("authenticates the exact self-contained executable in both artifact handoffs", () => {
    const workflow = readFileSync(".github/workflows/release-evidence.yml", "utf8");
    const receiptMentions = workflow.match(/release-publication-receipt\.mjs/g) ?? [];

    expect(receiptMentions.length).toBeGreaterThanOrEqual(5);
    expect(workflow).toContain("release-publication-receipt.mjs \\");
    expect(workflow).toContain("sha256sum --check verification-handoff.sha256");
    expect(workflow).toContain("sha256sum --check release-bundle.sha256");
  });

  it("can be imported from an eval runtime without a script argv entry", () => {
    const moduleUrl = pathToFileURL(
      `${process.cwd()}/scripts/release-publication-receipt.mjs`,
    ).href;
    const result = spawnSync(
      process.execPath,
      ["--input-type=module", "--eval", `await import(${JSON.stringify(moduleUrl)})`],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toBe("");
  });
});