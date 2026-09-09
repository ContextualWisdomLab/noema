import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { readStrictJsonEvidenceWithSha256 } from "../scripts/lib/strict-json-evidence.mjs";

describe("external-extension lifecycle retained evidence digest", () => {
  it("computes SHA-256 from the exact descriptor-read bytes without a second read", () => {
    const raw = Buffer.from('{"status":"PASS","records":129}\n', "utf8");
    let reads = 0;

    const result = readStrictJsonEvidenceWithSha256("retained-lifecycle.json", {
      readRaw: () => {
        reads += 1;
        return raw;
      },
    });

    expect(reads).toBe(1);
    expect(result).toEqual({
      ok: true,
      path: "retained-lifecycle.json",
      value: { status: "PASS", records: 129 },
      sha256: createHash("sha256").update(raw).digest("hex"),
    });
  });

  it("does not emit a digest for ambiguous retained JSON", () => {
    const result = readStrictJsonEvidenceWithSha256("retained-lifecycle.json", {
      readRaw: () => Buffer.from('{"status":"FAIL","st\\u0061tus":"PASS"}', "utf8"),
    });

    expect(result).toEqual({
      ok: false,
      path: "retained-lifecycle.json",
      reason: "duplicate_keys",
    });
    expect("sha256" in result).toBe(false);
  });
});
