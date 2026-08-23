import { describe, expect, it } from "vitest";
import { hasUnsafeSourceId } from "../scripts/lib/source-id.mjs";

describe("KPI source-id canonical identity", () => {
  it.each([
    " cloudflare-logpush:noema-production",
    "cloudflare-logpush:noema-production ",
    "\tgithub-app:noema-reviewer",
    "github:repository-noema\n",
  ])("rejects surrounding whitespace in source label %j", (sourceId) => {
    expect(hasUnsafeSourceId(sourceId)).toBe(true);
  });

  it.each([
    "cloudflare-logpush:\nnoema-production",
    "cloudflare-logpush:\u0000noema-production",
    "cloudflare-logpush:\u202Enoema-production",
    "cloudflare-logpush:\u2028noema-production",
    "cloudflare-logpush:\u2029noema-production",
    "cloudflare-logpush:\uD800noema-production",
    "cloudflare-logpush:\u00A0noema-production",
    "cloudflare-logpush:\u202Fnoema-production",
    "cloudflare-logpush:\u3000noema-production",
  ])("rejects embedded control, separator, format, surrogate, or non-canonical space characters in source label %j", (sourceId) => {
    expect(hasUnsafeSourceId(sourceId)).toBe(true);
  });

  it("rejects a canonically equivalent but non-NFC source label", () => {
    expect(hasUnsafeSourceId("cloudflare-logpush:noema-e\u0301")).toBe(true);
  });

  it.each([
    "cloudflare-logpush:noema-production",
    "github-app:noema-reviewer",
    "github:repository-noema",
    "cloudflare-logpush:noema-é",
  ])("keeps exact non-secret source label %s", (sourceId) => {
    expect(hasUnsafeSourceId(sourceId)).toBe(false);
  });
});
