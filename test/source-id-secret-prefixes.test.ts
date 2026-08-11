import { describe, expect, it } from "vitest";
import { hasUnsafeSourceId } from "../scripts/lib/source-id.mjs";

describe("KPI source-id credential prefix safety", () => {
  it.each([
    "ghp_SYNTHETIC_NOT_A_TOKEN",
    "github_pat_SYNTHETIC_NOT_A_TOKEN",
    "github:gho_SYNTHETIC_NOT_A_TOKEN",
    "github:ghu_SYNTHETIC_NOT_A_TOKEN",
    "github:ghs_SYNTHETIC_NOT_A_TOKEN",
    "github:ghr_SYNTHETIC_NOT_A_TOKEN",
  ])("rejects GitHub credential-shaped source label %s", (sourceId) => {
    expect(hasUnsafeSourceId(sourceId)).toBe(true);
  });

  it.each([
    "cloudflare-logpush:hockey-production",
    "github-app:noema-reviewer",
    "github:repository-noema",
    "ghp-metrics",
  ])("keeps descriptive non-secret source label %s", (sourceId) => {
    expect(hasUnsafeSourceId(sourceId)).toBe(false);
  });
});
