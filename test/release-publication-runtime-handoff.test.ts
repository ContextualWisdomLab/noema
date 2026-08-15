import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("release publication receipt runtime handoff", () => {
  it("ships every relative module required by the isolated publication receipt", () => {
    const workflow = readFileSync(".github/workflows/release-evidence.yml", "utf8");

    expect(workflow).toContain(
      "receipt-runtime/scripts/release-publication-receipt.mjs",
    );
    expect(workflow).toContain(
      "receipt-runtime/scripts/normalize-commercial-readiness-evidence.mjs",
    );
    expect(workflow).toContain(
      "receipt-runtime/scripts/lib/stable-file-evidence.mjs",
    );
    expect(workflow).toContain(
      'node "$BUNDLE_DIR/receipt-runtime/scripts/release-publication-receipt.mjs"',
    );
    expect(workflow).not.toContain(
      "install -m 0644 scripts/release-publication-receipt.mjs release-publication-receipt.mjs",
    );
  });

  it("authenticates the complete receipt runtime in both artifact handoffs", () => {
    const workflow = readFileSync(".github/workflows/release-evidence.yml", "utf8");
    const checksumMentions = workflow.match(/receipt-runtime\/scripts\/release-publication-receipt\.mjs/g) ?? [];
    const normalizeMentions = workflow.match(/receipt-runtime\/scripts\/normalize-commercial-readiness-evidence\.mjs/g) ?? [];
    const stableReaderMentions = workflow.match(/receipt-runtime\/scripts\/lib\/stable-file-evidence\.mjs/g) ?? [];

    expect(checksumMentions.length).toBeGreaterThanOrEqual(3);
    expect(normalizeMentions.length).toBeGreaterThanOrEqual(2);
    expect(stableReaderMentions.length).toBeGreaterThanOrEqual(2);
  });
});
