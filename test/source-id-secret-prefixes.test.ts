import { describe, expect, it } from "vitest";
import { hasUnsafeSourceId } from "../scripts/lib/source-id.mjs";

describe("KPI source-id credential prefix safety", () => {
  it.each([
    "ghp_EXAMPLEVALUE123456",
    "github_pat_EXAMPLEVALUE123456",
    "github:gho_EXAMPLEVALUE123456",
    "github:ghu_EXAMPLEVALUE123456",
    "github:ghs_EXAMPLEVALUE123456",
    "github:ghr_EXAMPLEVALUE123456",
  ])("rejects GitHub credential-shaped source label %s", (sourceId) => {
    expect(hasUnsafeSourceId(sourceId)).toBe(true);
  });

  it.each([
    "clientSecret=EXAMPLEVALUE123456",
    "clientsecret=EXAMPLEVALUE123456",
    "sessionToken=EXAMPLEVALUE123456",
    "sessiontoken=EXAMPLEVALUE123456",
    "accessKeyId=AKIAEXAMPLEVALUE",
    "accesskeyid=AKIAEXAMPLEVALUE",
    "refreshToken=EXAMPLEVALUE123456",
    "refreshtoken=EXAMPLEVALUE123456",
    "secretAccessKey=EXAMPLEVALUE123456",
    "secretaccesskey=EXAMPLEVALUE123456",
  ])("rejects compact or camel-case credential-shaped source label %s", (sourceId) => {
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
