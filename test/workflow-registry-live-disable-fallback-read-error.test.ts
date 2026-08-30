import { describe, expect, it } from "vitest";

import { createWorkflowRegistryGithubJsonReader } from "../scripts/workflow-registry-live-disable.mjs";

const endpoint = "repos/ContextualWisdomLab/noema/actions/workflows?per_page=100&page=1";

describe("workflow registry arrayBuffer fallback failures", () => {
  it("propagates a non-timeout fallback read failure while request authority remains live", async () => {
    const response = {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      body: null,
      arrayBuffer: async () => {
        throw new Error("upstream fallback read failed");
      },
    } as unknown as Response;
    const ghJson = createWorkflowRegistryGithubJsonReader({
      token: "test-token",
      fetchImpl: async () => response,
    });

    await expect(ghJson(endpoint)).rejects.toThrow("upstream fallback read failed");
  });
});
