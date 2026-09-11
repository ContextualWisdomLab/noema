import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "..");
const reviewerReadme = readFileSync(resolve(repositoryRoot, "reviewer/README.md"), "utf8");

describe("reviewer operator documentation attempt authority", () => {
  it("does not advertise Noema-local timeout or retry allocation as supported configuration", () => {
    expect(reviewerReadme).not.toContain(
      "`NOEMA_LLM_REQUEST_TIMEOUT_SECONDS` (default `5400`, allowed `60..7200`)",
    );
    expect(reviewerReadme).not.toContain(
      "`NOEMA_LLM_MAX_RETRIES` (default `1`, allowed `0..8`)",
    );
    expect(reviewerReadme).not.toContain("defaults to 5,400 seconds");
    expect(reviewerReadme).not.toContain("provider 429/5xx responses receive bounded SDK retries");
    expect(reviewerReadme).toContain(
      "`NOEMA_LLM_REQUEST_TIMEOUT_SECONDS` and `NOEMA_LLM_MAX_RETRIES` are legacy Noema-local attempt controls and must be unset",
    );
    expect(reviewerReadme).toContain(
      "model-attempt allocation remains contextual-orchestrator authority",
    );
    expect(reviewerReadme).toContain("`timeout=None`");
    expect(reviewerReadme).toContain("`max_retries=0`");
  });
});
