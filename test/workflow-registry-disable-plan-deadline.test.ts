import { afterEach, describe, expect, it, vi } from "vitest";
import { createGithubWorkflowDisablementTransport } from "../scripts/workflow-registry-disable-plan.mjs";

const REPOSITORY = "ContextualWisdomLab/noema";
const MAIN_SHA = "a".repeat(40);
const TEST_GUARD_MS = 100;

function timeoutReason() {
  return new DOMException("workflow registry request deadline exceeded", "TimeoutError");
}

async function expectBoundedTimeout(promise: Promise<unknown>) {
  const guard = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("test guard expired before Noema enforced its deadline")), TEST_GUARD_MS);
  });
  await expect(Promise.race([promise, guard])).rejects.toThrow(
    "GitHub workflow disablement transport request timed out",
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("privileged workflow disablement end-to-end deadline", () => {
  it("times out even when the credential-bearing transport ignores AbortSignal", async () => {
    const controller = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    const fetchImpl = vi.fn(() => new Promise<Response>(() => undefined));
    const transport = createGithubWorkflowDisablementTransport({
      token: "delegated-token",
      fetchImpl,
    });

    const request = transport.revalidateDefaultBranch({ repository: REPOSITORY });
    controller.abort(timeoutReason());

    await expectBoundedTimeout(request);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("times out and discards a stalled response body even when the reader ignores AbortSignal", async () => {
    const controller = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    const cancel = vi.fn(async () => undefined);
    const read = vi.fn(() => new Promise<ReadableStreamReadResult<Uint8Array>>(() => undefined));
    const response = {
      ok: true,
      status: 200,
      headers: {
        get(name: string) {
          return name.toLowerCase() === "content-type" ? "application/json" : null;
        },
      },
      body: {
        getReader() {
          return { read, cancel };
        },
      },
      arrayBuffer: vi.fn(),
    } as unknown as Response;
    const transport = createGithubWorkflowDisablementTransport({
      token: "delegated-token",
      fetchImpl: vi.fn(async () => response),
    });

    const request = transport.revalidateDefaultBranch({ repository: REPOSITORY });
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    controller.abort(timeoutReason());

    await expectBoundedTimeout(request);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("keeps ordinary successful JSON parsing unchanged", async () => {
    const transport = createGithubWorkflowDisablementTransport({
      token: "delegated-token",
      fetchImpl: vi.fn(async () => new Response(
        JSON.stringify({ commit: { sha: MAIN_SHA } }),
        { status: 200, headers: { "content-type": "application/json" } },
      )),
    });

    await expect(
      transport.revalidateDefaultBranch({ repository: REPOSITORY }),
    ).resolves.toEqual({ sha: MAIN_SHA });
  });
});
