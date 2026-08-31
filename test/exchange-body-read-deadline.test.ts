import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import entrypoint, { type Env } from "../src/entrypoint";

const TEST_FAILSAFE_MS = 10_500;

/** Build a realistic chunked JSON request that sends a valid prefix and then stalls forever. */
function stalledJsonRequest(cancellations: string[]): Request {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode('{"target_repository":"ContextualWisdomLab/noema"'),
      );
    },
    cancel(reason) {
      cancellations.push(String(reason));
    },
  });

  return new Request("https://noema.example/exchange", {
    method: "POST",
    headers: {
      authorization: "Bearer a.b.c",
      "content-type": "application/json",
      "x-request-id": "stalled-exchange-body",
    },
    body: stream,
    duplex: "half",
  } as RequestInit);
}

describe("exchange request-body read deadline", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("fails closed on a slowloris-style JSON stream before credential-bearing work", async () => {
    vi.useFakeTimers();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cancellations: string[] = [];

    const exchange = entrypoint.fetch(stalledJsonRequest(cancellations), {} as Env);
    const testFailsafe = new Promise<"test-failsafe">((resolve) => {
      setTimeout(() => resolve("test-failsafe"), TEST_FAILSAFE_MS);
    });
    const observed = Promise.race([exchange, testFailsafe]);

    await vi.advanceTimersByTimeAsync(TEST_FAILSAFE_MS);
    const result = await observed;

    expect(result).not.toBe("test-failsafe");
    if (result === "test-failsafe") return;

    expect(result.status).toBe(408);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(result.headers.get("pragma")).toBe("no-cache");
    expect(result.headers.get("x-content-type-options")).toBe("nosniff");
    expect(result.headers.get("x-trace-id")).toBe("stalled-exchange-body");
    await expect(result.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_VALIDATION_INPUT",
      message: "Exchange JSON body read deadline exceeded",
      details: {
        policy: "bounded-exchange-json-body",
        body_limit_bytes: "8192",
        read_deadline_ms: "10000",
        reason: "timeout",
      },
      trace_id: "stalled-exchange-body",
    });
    await Promise.resolve();
    expect(cancellations).toEqual(["Noema exchange JSON body read deadline exceeded"]);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('"reason":"timeout"'));
  });

  it("keeps canonical technical and traceability documentation aligned with the shipped deadline", () => {
    const trd = readFileSync(new URL("../docs/TRD.md", import.meta.url), "utf8");
    const traceability = readFileSync(
      new URL("../docs/TRACEABILITY.md", import.meta.url),
      "utf8",
    );

    expect(trd).toContain("10,000 ms");
    expect(trd).toContain("HTTP 408");
    expect(trd).toContain("scripts/smoke-readiness.sh");
    expect(traceability).toContain("Inbound `/exchange` body deadline");
    expect(traceability).toContain("10,000 ms");
    expect(traceability).toContain("stalled-body deployment smoke");
  });
});
