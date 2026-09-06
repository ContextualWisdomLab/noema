import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("trusted workflow source roll-forward preserves deployed runtime state declarations", () => {
  it("keeps the existing Durable Object exports instead of redeclaring deployed classes as new migrations", () => {
    const wrangler = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");

    expect(wrangler).toContain('[exports.NoemaRateLimiter]\ntype = "durable-object"\nstorage = "sqlite"');
    expect(wrangler).toContain('[exports.NoemaOidcReplayGuard]\ntype = "durable-object"\nstorage = "sqlite"');
    expect(wrangler).not.toContain("new_sqlite_classes");
  });
});
