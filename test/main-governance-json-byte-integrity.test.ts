import { describe, expect, it } from "vitest";
import { parseGithubActiveRulesJsonBytes } from "../scripts/main-governance-audit.mjs";

describe("main governance GitHub API JSON byte integrity", () => {
  it("parses ordinary paginated active-rules JSON bytes", () => {
    const raw = Buffer.from('[[{"type":"deletion","ruleset_id":18794436}]]', "utf8");

    expect(parseGithubActiveRulesJsonBytes(raw)).toEqual([
      [{ type: "deletion", ruleset_id: 18_794_436 }],
    ]);
  });

  it("rejects malformed UTF-8 instead of replacement-decoding live governance evidence", () => {
    const raw = Buffer.from([0x5b, 0x5b, 0x7b, 0x22, 0x74, 0x79, 0x70, 0x65, 0x22, 0x3a, 0xc3, 0x28, 0x7d, 0x5d, 0x5d]);

    expect(() => parseGithubActiveRulesJsonBytes(raw)).toThrow(/invalid UTF-8/i);
  });

  it("rejects escape-equivalent duplicate decoded rule keys before JSON.parse last-key-wins", () => {
    const raw = Buffer.from('[[{"type":"deletion","t\\u0079pe":"pull_request"}]]', "utf8");

    expect(() => parseGithubActiveRulesJsonBytes(raw)).toThrow(/ambiguous JSON/i);
  });
});
