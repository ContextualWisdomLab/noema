import { describe, expect, it } from "vitest";
import { parseGithubApiJsonBytes } from "../scripts/maintainer-app-readiness.mjs";

describe("Maintainer App GitHub API JSON byte integrity", () => {
  it("parses ordinary bounded GitHub API JSON bytes", () => {
    const raw = Buffer.from('{"id":123,"login":"noema-maintainer[bot]"}', "utf8");

    expect(parseGithubApiJsonBytes(raw, "Maintainer identity")).toEqual({
      id: 123,
      login: "noema-maintainer[bot]",
    });
  });

  it("rejects malformed UTF-8 instead of replacement-decoding GitHub API evidence", () => {
    const raw = Buffer.from([0x7b, 0x22, 0x69, 0x64, 0x22, 0x3a, 0xc3, 0x28, 0x7d]);

    expect(() => parseGithubApiJsonBytes(raw, "Maintainer identity")).toThrow(
      /Maintainer identity returned invalid UTF-8/i,
    );
  });

  it("rejects escape-equivalent duplicate decoded keys before JSON.parse last-key-wins", () => {
    const raw = Buffer.from('{"id":111,"i\\u0064":222}', "utf8");

    expect(() => parseGithubApiJsonBytes(raw, "Maintainer identity")).toThrow(
      /Maintainer identity returned ambiguous JSON/i,
    );
  });
});
