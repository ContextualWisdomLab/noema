import { afterEach, describe, expect, it, vi } from "vitest";
import { createGithubWorkflowDisablementTransport } from "../scripts/workflow-registry-disable-plan.mjs";

const REPOSITORY = "ContextualWisdomLab/noema";
const MAIN_SHA = "a".repeat(40);
const TEST_GUARD_MS = 100;

function timeoutReason() {
  return new DOMException("workflow registry request deadline exceeded", "TimeoutError");
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function expectBoundedTimeout(promise: Promise<unknown>) {
  const guard = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("test guard expired before Noema enforced its deadline")), TEST_GUARD_MS);
  });
  await expect(Promise.race([promise, guard])).rejects.toThrow(
    "GitHub workflow disablement transport request timed out",
  );
}

function jsonHeaders() {
  return {
    get(name: string) {
      return name.toLowerCase() === "content-type" ? "application/json" : null;
    },
  };
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

  it("does not trust a bodyless response that arrives after request authority expired", async () => {
    const controller = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    const pending = deferred<Response>();
    const transport = createGithubWorkflowDisablementTransport({
      token: "delegated-token",
      fetchImpl: vi.fn(() => pending.promise),
    });

    const request = transport.revalidateDefaultBranch({ repository: REPOSITORY });
    controller.abort(timeoutReason());
    await expectBoundedTimeout(request);

    pending.resolve(new Response(null, { status: 200 }));
    await Promise.resolve();
    await Promise.resolve();
  });

  it("best-effort discards a late response without letting rejected cleanup replace the timeout", async () => {
    const controller = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    const pending = deferred<Response>();
    const cancel = vi.fn(() => Promise.reject(new Error("cleanup rejected")));
    const transport = createGithubWorkflowDisablementTransport({
      token: "delegated-token",
      fetchImpl: vi.fn(() => pending.promise),
    });

    const request = transport.revalidateDefaultBranch({ repository: REPOSITORY });
    controller.abort(timeoutReason());
    await expectBoundedTimeout(request);

    pending.resolve({ body: { cancel } } as unknown as Response);
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
    await Promise.resolve();
  });

  it("absorbs a late transport rejection after the request timeout already owns the result", async () => {
    const controller = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    const pending = deferred<Response>();
    const transport = createGithubWorkflowDisablementTransport({
      token: "delegated-token",
      fetchImpl: vi.fn(() => pending.promise),
    });

    const request = transport.revalidateDefaultBranch({ repository: REPOSITORY });
    controller.abort(timeoutReason());
    await expectBoundedTimeout(request);

    pending.reject(new Error("late transport rejection"));
    await Promise.resolve();
    await Promise.resolve();
  });

  it("times out and discards a stalled response body even when the reader ignores AbortSignal", async () => {
    const controller = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    const cancel = vi.fn(async () => undefined);
    const read = vi.fn(() => new Promise<ReadableStreamReadResult<Uint8Array>>(() => undefined));
    const response = {
      ok: true,
      status: 200,
      headers: jsonHeaders(),
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

  it("enforces the same deadline on an arrayBuffer fallback that ignores AbortSignal", async () => {
    const controller = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    const cancel = vi.fn(() => undefined);
    const arrayBuffer = vi.fn(() => new Promise<ArrayBuffer>(() => undefined));
    const response = {
      ok: true,
      status: 200,
      headers: jsonHeaders(),
      body: { cancel },
      arrayBuffer,
    } as unknown as Response;
    const transport = createGithubWorkflowDisablementTransport({
      token: "delegated-token",
      fetchImpl: vi.fn(async () => response),
    });

    const request = transport.revalidateDefaultBranch({ repository: REPOSITORY });
    await vi.waitFor(() => expect(arrayBuffer).toHaveBeenCalledTimes(1));
    controller.abort(timeoutReason());

    await expectBoundedTimeout(request);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("does not misclassify an ordinary arrayBuffer read failure as a timeout", async () => {
    const controller = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    const response = {
      ok: true,
      status: 200,
      headers: jsonHeaders(),
      body: {},
      arrayBuffer: vi.fn(async () => {
        throw new Error("fallback read failed");
      }),
    } as unknown as Response;
    const transport = createGithubWorkflowDisablementTransport({
      token: "delegated-token",
      fetchImpl: vi.fn(async () => response),
    });

    await expect(
      transport.revalidateDefaultBranch({ repository: REPOSITORY }),
    ).rejects.toThrow("fallback read failed");
  });

  it("keeps timeout cleanup non-authoritative even when cancellation throws synchronously", async () => {
    const controller = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    const cancel = vi.fn(() => {
      throw new Error("cleanup threw");
    });
    const read = vi.fn(() => new Promise<ReadableStreamReadResult<Uint8Array>>(() => undefined));
    const response = {
      ok: true,
      status: 200,
      headers: jsonHeaders(),
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
