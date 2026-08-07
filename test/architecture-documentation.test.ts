import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("authoritative architecture documentation", () => {
  it("keeps the root architecture contract present and aligned with the runtime", () => {
    expect(existsSync("ARCHITECTURE.md")).toBe(true);

    const architecture = readFileSync("ARCHITECTURE.md", "utf8");
    for (const required of [
      "src/runtime-entrypoint.ts",
      "/health",
      "/ready",
      "/exchange",
      "NoemaRateLimiter",
      "NoemaOidcReplayGuard",
      "ContextualWisdomLab/.github",
      "naruon",
      "contextual-orchestrator",
      "exact-head",
      "check runs",
      "commit statuses",
      "model judgement",
    ]) {
      expect(architecture).toContain(required);
    }
  });

  it("does not teach agents the superseded single-file runtime model", () => {
    const guidance = readFileSync("CLAUDE.md", "utf8");

    expect(guidance).toContain("src/runtime-entrypoint.ts");
    expect(guidance).toContain("NoemaRateLimiter");
    expect(guidance).toContain("NoemaOidcReplayGuard");
    expect(guidance).not.toContain("The entire Worker is one file");
    expect(guidance).not.toContain("There are no KV/D1/queue/Durable Object bindings");
  });

  it("makes the architecture contract discoverable from the README", () => {
    const readme = readFileSync("README.md", "utf8");

    expect(readme).toContain("[Architecture & Trust Boundaries](./ARCHITECTURE.md)");
  });
});
