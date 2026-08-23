import { describe, expect, it } from "vitest";
import { hasUnsafeSourceId } from "../scripts/lib/source-id.mjs";

describe("source-id exact production coverage", () => {
  it.each([
    " source",
    "source ",
    "ｓｏｕｒｃｅ",
    "source\u0000id",
    "source\u202Eid",
    "source\uD800id",
    "source\u2028id",
    "source\u2029id",
    "source\u00A0id",
    "placeholder",
    "todo",
    "tbd",
    "replace-with-source",
    "https://logs.noema.internal/export",
    "source?token=redacted",
    "ghp_EXAMPLEVALUE123456",
    "npm_abcdefghijklmnopqrstuvwxyz0123456789",
    "token=EXAMPLEVALUE123456",
    "apiKey=EXAMPLEVALUE123456",
    "clientSecret=EXAMPLEVALUE123456",
    "authorization=Bearer EXAMPLEVALUE123456",
  ])("executes a fail-closed source identity branch for %j", (sourceId) => {
    expect(hasUnsafeSourceId(sourceId)).toBe(true);
  });

  it.each([
    undefined,
    null,
    "",
    "cloudflare-logpush:noema-production",
    "github-app:noema-reviewer",
    "npm-package-metadata",
    "source-é",
  ])("executes a non-secret source identity branch for %j", (sourceId) => {
    expect(hasUnsafeSourceId(sourceId)).toBe(false);
  });
});
