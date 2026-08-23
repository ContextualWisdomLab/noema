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
  ])("rejects embedded control or format characters in source label %j", (sourceId) => {
    expect(hasUnsafeSourceId(sourceId)).toBe(true);
  });

  it.each([
    "cloudflare-logpush:noema-production",
    "github-app:noema-reviewer",
    "github:repository-noema",
  ])("keeps exact non-secret source label %s", (sourceId) => {
    expect(hasUnsafeSourceId(sourceId)).toBe(false);
  });
});
