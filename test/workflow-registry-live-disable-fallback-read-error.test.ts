import { describe, expect, it, vi } from "vitest";

import { createWorkflowRegistryGithubJsonReader } from "../scripts/workflow-registry-live-disable.mjs";

const endpoint = "repos/ContextualWisdomLab/noema/actions/workflows?per_page=100&page=1";

describe("workflow registry unstreamable body failures", () => {
  it("rejects before invoking a failing arrayBuffer fallback", async () => {
    const arrayBuffer = vi.fn(async () => {
      throw new Error("upstream fallback read failed");
    });
    const response = {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      body: null,
      arrayBuffer,
    } as unknown as Response;
    const ghJson = createWorkflowRegistryGithubJsonReader({
      token: "test-token",
      fetchImpl: async () => response,
    });

    await expect(ghJson(endpoint)).rejects.toThrow("response body is not stream-readable");
    expect(arrayBuffer).not.toHaveBeenCalled();
  });
});
