import { describe, expect, it } from "vitest";

import { createWorkflowRegistryGithubJsonReader } from "../scripts/workflow-registry-live-disable.mjs";

describe("workflow registry live-disable response bounds", () => {
  it("assembles a bounded chunked GitHub response without relying on Content-Length", async () => {
    const chunks = [
      new TextEncoder().encode('{"total_count":'),
      new TextEncoder().encode('0,"workflows":[]}'),
    ];
    let index = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (index === chunks.length) {
          controller.close();
          return;
        }
        controller.enqueue(chunks[index]);
        index += 1;
      },
    });

    const ghJson = createWorkflowRegistryGithubJsonReader({
      token: "test-token",
      fetchImpl: async () => new Response(body, {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    });

    await expect(
      ghJson("repos/ContextualWisdomLab/noema/actions/workflows?per_page=100&page=1"),
    ).resolves.toEqual({ total_count: 0, workflows: [] });
  });

  it("stops reading and cancels a chunked GitHub response as soon as the byte limit is crossed", async () => {
    const chunk = new Uint8Array(128 * 1024).fill(0x20);
    const totalChunks = 80;
    let pulls = 0;
    let cancelled = false;

    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(chunk);
        if (pulls === totalChunks) controller.close();
      },
      cancel() {
        cancelled = true;
      },
    });

    const ghJson = createWorkflowRegistryGithubJsonReader({
      token: "test-token",
      fetchImpl: async () => new Response(body, {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    });

    await expect(
      ghJson("repos/ContextualWisdomLab/noema/actions/workflows?per_page=100&page=1"),
    ).rejects.toThrow("workflow registry GitHub response exceeds the bounded size limit");

    expect(pulls).toBeLessThan(totalChunks);
    expect(cancelled).toBe(true);
  });

  it("rejects a UTF-8 BOM instead of normalizing different authority bytes into valid JSON", async () => {
    const json = new TextEncoder().encode('{"total_count":0,"workflows":[]}');
    const body = new Uint8Array(3 + json.byteLength);
    body.set([0xef, 0xbb, 0xbf], 0);
    body.set(json, 3);

    const ghJson = createWorkflowRegistryGithubJsonReader({
      token: "test-token",
      fetchImpl: async () => new Response(body, {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    });

    await expect(
      ghJson("repos/ContextualWisdomLab/noema/actions/workflows?per_page=100&page=1"),
    ).rejects.toThrow("workflow registry GitHub response returned invalid JSON");
  });
});
