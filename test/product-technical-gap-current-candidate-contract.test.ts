import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("product-technical gap current authority", () => {
  it("records integrated external-extension admission and the durable lifecycle successor without overclaiming completion", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(baseline).toContain("issue #545 / merged PR #560");
    expect(baseline).toContain("Runtime-current authority RED `4be371ec08b852f4d00829ba5aa6936df6564b5e`");
    expect(baseline).toContain("Noema Policy / Approval issuance");
    expect(baseline).toContain("runtime wall clock");
    expect(baseline).toContain("Replay semantic RED `cb8ad638875b761aea70aba78a480bd5031c4d7d`");
    expect(baseline).toContain("normalized invocation envelope");
    expect(baseline).toContain("Unbound core-receipt RED `5a50a9bcfe12f3938b30e4a3cb15af8d30134391`");
    expect(baseline).toContain("public binding이 없는 retained receipt를 fail closed");
    expect(baseline).toContain("policy drift/revocation");
    expect(baseline).toContain("admission-bound live authority");
    expect(baseline).toContain("Exact-admission provenance RED");
    expect(baseline).toContain("Plaintext replay-retention RED");
    expect(baseline).toContain("Worker Web Crypto");
    expect(baseline).toContain("ADR 0015는 protected source에 포함됐지만 상태는 `Proposed`");
    expect(baseline).toContain("merged #560 + issue #561");
    expect(baseline).toContain("append-only versioned lifecycle stream");
    expect(baseline).toContain("context-graph-contracts");
    expect(baseline).toContain("live plugin installation 또는 buyer completion을 주장하지 않는다");
    expect(baseline).toContain("immutable Noema release");
  });
});
