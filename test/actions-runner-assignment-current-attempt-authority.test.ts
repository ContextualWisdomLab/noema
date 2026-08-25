import { describe, expect, it, vi } from "vitest";

const observedCapabilityPath = vi.hoisted(() => ({ value: undefined as unknown }));

vi.mock("../scripts/lib/delegated-github-token.mjs", () => ({
  readDelegatedGithubToken: (tokenPath: unknown) => {
    observedCapabilityPath.value = tokenPath;
    throw new Error("stop-after-capability-path-observation");
  },
}));

import {
  createGhReadAdapters,
  main,
} from "../scripts/actions-runner-assignment-audit.mjs";

describe("runner-assignment current-attempt authority", () => {
  it("preserves configured delegated capability-path bytes until the hardened reader", async () => {
    const configuredPath = " /tmp/noema-runner-audit-token\t";

    await expect(main({
      env: {
        NOEMA_MAINTAINER_TOKEN_PATH: configuredPath,
      },
    })).rejects.toThrow("stop-after-capability-path-observation");

    expect(observedCapabilityPath.value).toBe(configuredPath);
  });

  it("reads jobs only from the exact positive workflow attempt", async () => {
    const ghApiReader = vi.fn(async () => [{ jobs: [] }]);
    const adapters = createGhReadAdapters({
      repository: "ContextualWisdomLab/noema",
      gh_api: ghApiReader,
    });

    await expect(adapters.fetch_job_pages(100, 2)).resolves.toEqual([{ jobs: [] }]);
    expect(ghApiReader).toHaveBeenCalledWith(
      "repos/ContextualWisdomLab/noema/actions/runs/100/attempts/2/jobs?per_page=100",
      { paginate: true },
    );
  });
});
