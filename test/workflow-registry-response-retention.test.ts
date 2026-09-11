import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { createGithubWorkflowDisablementTransport } from "../scripts/workflow-registry-disable-plan.mjs";
import { createWorkflowRegistryGithubJsonReader } from "../scripts/workflow-registry-live-disable.mjs";

const repository = "ContextualWisdomLab/noema";
const mainSha = "1".repeat(40);

function oneByteStream(text: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index === bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.subarray(index, index + 1));
      index += 1;
    },
  });
}

function jsonResponse(text: string): Response {
  return new Response(oneByteStream(text), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("workflow registry response retained-heap bounds", () => {
  it("does not retain one response chunk object per live-registry read", () => {
    const source = readFileSync("scripts/workflow-registry-live-disable.mjs", "utf8");
    expect(source).not.toContain("const chunks = []");
    expect(source).not.toContain("chunks.push(value)");
  });

  it("does not retain one response chunk object per disablement-transport read", () => {
    const source = readFileSync("scripts/workflow-registry-disable-plan.mjs", "utf8");
    expect(source).not.toContain("const chunks = []");
    expect(source).not.toContain("chunks.push(value)");
  });

  it("parses a live registry response fragmented into one-byte chunks", async () => {
    const reader = createWorkflowRegistryGithubJsonReader({
      token: "delegated-token",
      fetchImpl: async () => jsonResponse('{"total_count":0,"workflows":[]}'),
    });

    await expect(
      reader("repos/ContextualWisdomLab/noema/actions/workflows?per_page=100&page=1"),
    ).resolves.toEqual({ total_count: 0, workflows: [] });
  });

  it("revalidates protected main from a one-byte-fragmented transport response", async () => {
    const transport = createGithubWorkflowDisablementTransport({
      token: "delegated-token",
      fetchImpl: async () => jsonResponse(JSON.stringify({ commit: { sha: mainSha } })),
    });

    await expect(
      transport.revalidateDefaultBranch({ repository }),
    ).resolves.toEqual({ sha: mainSha });
  });
});
