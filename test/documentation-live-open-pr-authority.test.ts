import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("product-technical gap baseline live source authority", () => {
  it("treats #560 as integrated protected history without promoting downstream completion", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(baseline).toContain("Integrated external-extension admission — issue #545 / merged PR #560");
    expect(baseline).toContain("PR #560 exact `5aab7c098f3478069127f34e398326415ec599a4`");
    expect(baseline).toContain("Resulting protected merge는 GitHub-verified `e3aa77c3f678336c548440f355f988345b0ba976`");
    expect(baseline).toContain("application CI `34289599257`");
    expect(baseline).toContain("patch-validator-image `34289599248`");
    expect(baseline).toContain("Policy / Approval issuance");
    expect(baseline).toContain("Runtime-current authority RED `4be371ec08b852f4d00829ba5aa6936df6564b5e`");
    expect(baseline).toContain("Replay semantic RED `cb8ad638875b761aea70aba78a480bd5031c4d7d`");
    expect(baseline).toContain("Exact-admission provenance RED `0a32ee0a88378931a07b7e3b61cc31e3b494a7ab`");
    expect(baseline).toContain("Worker Web Crypto `crypto.subtle.digest(\"SHA-256\", ...)`");
    expect(baseline).toContain("durable append-only lifecycle evidence");
    expect(baseline).toContain("ordinary/non-force");
    expect(baseline).not.toContain("## Active external-extension candidate");
    expect(baseline).not.toContain("PR #560의 ADR 0015는 candidate-only");
  });
});
