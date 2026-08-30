import { describe, expect, it, vi } from "vitest";
import { createGhReadAdapters } from "../scripts/actions-runner-assignment-audit.mjs";

describe("runner-assignment exact-attempt adapter authority", () => {
  it.each([0, 1.5])("rejects invalid workflow attempt %s before GitHub access", async (runAttempt) => {
    const ghApiReader = vi.fn();
    const adapters = createGhReadAdapters({
      repository: "ContextualWisdomLab/noema",
      gh_api: ghApiReader,
    });

    await expect(adapters.fetch_job_pages(100, runAttempt)).rejects.toThrow(
      "Workflow run_attempt must be a positive integer before reading jobs.",
    );
    expect(ghApiReader).not.toHaveBeenCalled();
  });
});
