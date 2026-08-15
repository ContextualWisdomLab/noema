import { describe, expect, it } from "vitest";

import { decodeGhOutput } from "../scripts/production-environment-governance-audit.mjs";

describe("production environment governance GitHub CLI UTF-8 boundary", () => {
  it("rejects malformed UTF-8 instead of replacement-decoding production evidence", () => {
    expect(() =>
      decodeGhOutput(
        Uint8Array.from([0x7b, 0x22, 0xff, 0x22, 0x7d]),
        "stdout",
      ),
    ).toThrow("GitHub CLI returned invalid UTF-8 in stdout.");
  });

  it("decodes valid UTF-8 bytes exactly", () => {
    const bytes = new TextEncoder().encode('{"name":"production"}\n');
    expect(decodeGhOutput(bytes, "stdout")).toBe('{"name":"production"}\n');
  });
});
