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

  it("rejects non-byte GitHub API evidence", () => {
    expect(() => parseGithubApiJsonBytes('{"id":123}', "Maintainer identity")).toThrow(
      /must be supplied as raw bytes/i,
    );
  });

  it("rejects empty GitHub API responses", () => {
    expect(() => parseGithubApiJsonBytes(Buffer.from("  \n\t", "utf8"), "Maintainer identity")).toThrow(
      /returned an empty response/i,
    );
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

  it("rejects syntactically invalid JSON without leaking unbounded parser diagnostics", () => {
    expect(() => parseGithubApiJsonBytes(Buffer.from('{"id":', "utf8"), "Maintainer identity")).toThrow(
      /Maintainer identity returned invalid JSON/i,
    );
  });
});
