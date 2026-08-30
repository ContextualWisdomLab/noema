import { describe, expect, it, vi } from "vitest";

import { createGithubWorkflowDisablementTransport } from "../scripts/workflow-registry-disable-plan.mjs";
import { createWorkflowRegistryGithubJsonReader } from "../scripts/workflow-registry-live-disable.mjs";

const REPOSITORY = "ContextualWisdomLab/noema";
const MAIN_SHA = "a".repeat(40);

function unstreamableResponse(body: string) {
  const arrayBuffer = vi.fn(async () => new TextEncoder().encode(body).buffer);
  const response = {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    body: { cancel: vi.fn(async () => undefined) },
    arrayBuffer,
  } as unknown as Response;
  return { response, arrayBuffer };
}

describe("workflow registry unstreamable response authority", () => {
  it("refuses privileged disablement evidence without buffering an unstreamable body", async () => {
    const { response, arrayBuffer } = unstreamableResponse(
      JSON.stringify({ commit: { sha: MAIN_SHA } }),
    );
    const transport = createGithubWorkflowDisablementTransport({
      token: "delegated-token",
      fetchImpl: vi.fn(async () => response),
    });

    await expect(
      transport.revalidateDefaultBranch({ repository: REPOSITORY }),
    ).rejects.toThrow(
      "GitHub workflow disablement transport response body is not stream-readable",
    );
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it("refuses live registry evidence without buffering an unstreamable body", async () => {
    const { response, arrayBuffer } = unstreamableResponse(
      JSON.stringify({ total_count: 0, workflows: [] }),
    );
    const ghJson = createWorkflowRegistryGithubJsonReader({
      token: "delegated-token",
      fetchImpl: vi.fn(async () => response),
    });

    await expect(
      ghJson("repos/ContextualWisdomLab/noema/actions/workflows?per_page=100&page=1"),
    ).rejects.toThrow("workflow registry GitHub response body is not stream-readable");
    expect(arrayBuffer).not.toHaveBeenCalled();
  });
});
