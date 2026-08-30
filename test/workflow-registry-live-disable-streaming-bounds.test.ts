import { describe, expect, it, vi } from "vitest";

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

  it("accepts the reviewed UTF-8 JSON media type parameter", async () => {
    const ghJson = createWorkflowRegistryGithubJsonReader({
      token: "test-token",
      fetchImpl: async () => new Response('{"total_count":0,"workflows":[]}', {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      }),
    });

    await expect(
      ghJson("repos/ContextualWisdomLab/noema/actions/workflows?per_page=100&page=1"),
    ).resolves.toEqual({ total_count: 0, workflows: [] });
  });

  it.each([201, 206])(
    "rejects successful-but-non-authoritative HTTP %s workflow registry responses",
    async (status) => {
      const ghJson = createWorkflowRegistryGithubJsonReader({
        token: "test-token",
        fetchImpl: async () => new Response('{"total_count":0,"workflows":[]}', {
          status,
          headers: { "content-type": "application/json" },
        }),
      });

      await expect(
        ghJson("repos/ContextualWisdomLab/noema/actions/workflows?per_page=100&page=1"),
      ).rejects.toThrow(`workflow registry GitHub request expected HTTP 200 but received HTTP ${status}`);
    },
  );

  it.each([
    "text/plain",
    "application/json; charset=iso-8859-1",
    "application/json; profile=workflow-registry",
    "application/json; charset=utf-8; profile=workflow-registry",
  ])("rejects unreviewed GitHub response media authority %s", async (contentType) => {
    const ghJson = createWorkflowRegistryGithubJsonReader({
      token: "test-token",
      fetchImpl: async () => new Response('{"total_count":0,"workflows":[]}', {
        status: 200,
        headers: { "content-type": contentType },
      }),
    });

    await expect(
      ghJson("repos/ContextualWisdomLab/noema/actions/workflows?per_page=100&page=1"),
    ).rejects.toThrow("workflow registry GitHub response did not declare JSON content");
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

  it("keeps the bounded oversize error authoritative when stream cancellation itself fails", async () => {
    const chunk = new Uint8Array(1024 * 1024).fill(0x20);
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(chunk);
      },
      cancel() {
        throw new Error("upstream cancellation detail must not escape");
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
  });

  it("terminates a stalled response body when the request deadline expires", async () => {
    const timeoutController = new AbortController();
    const timeoutReason = new DOMException("deadline", "TimeoutError");
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout").mockReturnValue(timeoutController.signal);
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull() {
        return new Promise<void>(() => undefined);
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

    const outcome = ghJson(
      "repos/ContextualWisdomLab/noema/actions/workflows?per_page=100&page=1",
    ).then(
      () => "resolved",
      (error: unknown) => error instanceof Error ? error.message : String(error),
    );
    await Promise.resolve();
    timeoutController.abort(timeoutReason);
    const result = await Promise.race([
      outcome,
      new Promise<string>((resolve) => setTimeout(() => resolve("watchdog"), 25)),
    ]);
    timeoutSpy.mockRestore();

    expect(result).toBe("workflow registry GitHub request timed out");
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
