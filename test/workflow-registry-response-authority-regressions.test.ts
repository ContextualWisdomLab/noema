import { afterEach, describe, expect, it, vi } from "vitest";

import { createGithubWorkflowDisablementTransport } from "../scripts/workflow-registry-disable-plan.mjs";
import { createWorkflowRegistryGithubJsonReader } from "../scripts/workflow-registry-live-disable.mjs";

const REPOSITORY = "ContextualWisdomLab/noema";
const MAIN_SHA = "a".repeat(40);
const REGISTRY_ENDPOINT = "repos/ContextualWisdomLab/noema/actions/workflows?per_page=100&page=1";
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

function timeoutReason() {
  return new DOMException("workflow registry request deadline exceeded", "TimeoutError");
}

function abortingDoneResponse(controller: AbortController, bytes: Uint8Array) {
  let reads = 0;
  const cancel = vi.fn(() => undefined);
  const read = vi.fn(async () => {
    reads += 1;
    if (reads === 1) {
      return { done: false, value: bytes } satisfies ReadableStreamReadResult<Uint8Array>;
    }
    return {
      get done() {
        controller.abort(timeoutReason());
        return true;
      },
      value: undefined,
    } as ReadableStreamReadResult<Uint8Array>;
  });
  const response = {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    body: {
      getReader() {
        return { read, cancel };
      },
    },
  } as unknown as Response;
  return { response, cancel };
}

function metadataRejectedResponse(headers: HeadersInit, cancel: () => unknown) {
  return {
    ok: true,
    status: 200,
    headers: new Headers(headers),
    body: { cancel },
  } as unknown as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("workflow registry response authority regressions", () => {
  it("rejects disablement evidence when the unchanged deadline expires at final stream completion", async () => {
    const controller = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    const bytes = new TextEncoder().encode(JSON.stringify({ commit: { sha: MAIN_SHA } }));
    const { response } = abortingDoneResponse(controller, bytes);
    const transport = createGithubWorkflowDisablementTransport({
      token: "delegated-token",
      fetchImpl: vi.fn(async () => response),
    });

    await expect(
      transport.revalidateDefaultBranch({ repository: REPOSITORY }),
    ).rejects.toThrow("GitHub workflow disablement transport request timed out");
  });

  it("rejects live-registry evidence when the unchanged deadline expires at final stream completion", async () => {
    const controller = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    const bytes = new TextEncoder().encode(JSON.stringify({ total_count: 0, workflows: [] }));
    const { response } = abortingDoneResponse(controller, bytes);
    const ghJson = createWorkflowRegistryGithubJsonReader({
      token: "delegated-token",
      fetchImpl: vi.fn(async () => response),
    });

    await expect(ghJson(REGISTRY_ENDPOINT)).rejects.toThrow(
      "workflow registry GitHub request timed out",
    );
  });

  it.each([
    {
      name: "invalid JSON media type",
      headers: { "content-type": "text/plain" },
      expected: "response did not declare JSON content",
    },
    {
      name: "oversized advertised body",
      headers: {
        "content-type": "application/json",
        "content-length": String(MAX_RESPONSE_BYTES + 1),
      },
      expected: "response exceeds the bounded size limit",
    },
  ])("cancels disablement response bodies before $name rejection", async ({ headers, expected }) => {
    const cancel = vi.fn(() => Promise.reject(new Error("cleanup failure must remain non-authoritative")));
    const response = metadataRejectedResponse(headers, cancel);
    const transport = createGithubWorkflowDisablementTransport({
      token: "delegated-token",
      fetchImpl: vi.fn(async () => response),
    });

    await expect(
      transport.revalidateDefaultBranch({ repository: REPOSITORY }),
    ).rejects.toThrow(expected);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      name: "invalid JSON media type",
      headers: { "content-type": "text/plain" },
      expected: "response did not declare JSON content",
    },
    {
      name: "oversized advertised body",
      headers: {
        "content-type": "application/json",
        "content-length": String(MAX_RESPONSE_BYTES + 1),
      },
      expected: "response exceeds the bounded size limit",
    },
  ])("cancels live-registry response bodies before $name rejection", async ({ headers, expected }) => {
    const cancel = vi.fn(() => {
      throw new Error("cleanup failure must remain non-authoritative");
    });
    const response = metadataRejectedResponse(headers, cancel);
    const ghJson = createWorkflowRegistryGithubJsonReader({
      token: "delegated-token",
      fetchImpl: vi.fn(async () => response),
    });

    await expect(ghJson(REGISTRY_ENDPOINT)).rejects.toThrow(expected);
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
