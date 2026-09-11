import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { readBoundedCloudflareJsonResponse } from "../scripts/lib/cloudflare-response.mjs";

const cloudflareTransportCallers = [
  "scripts/cloudflare-worker-deploy.mjs",
  "scripts/cloudflare-worker-status.mjs",
  "scripts/cloudflare-worker-recover.mjs",
] as const;

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function fakeResponse(reader: object, status = 200, ok = true): Response {
  return {
    body: { getReader: () => reader },
    status,
    ok,
  } as unknown as Response;
}

describe("Cloudflare control-plane response bounds", () => {
  it("applies byte and wall-clock bounds while streaming instead of buffering response.text() first", () => {
    for (const path of cloudflareTransportCallers) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("response.text()");
      expect(source).toContain("readBoundedCloudflareJsonResponse");
      expect(source).toContain("AbortSignal.timeout(120_000)");
    }
  });

  it("keeps canonical operational documentation aligned with the bounded transport contract", () => {
    const changelog = readFileSync("CHANGELOG.md", "utf8");
    const operability = readFileSync("docs/OPERABILITY.md", "utf8");
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(changelog).toContain("Cloudflare production control-plane deploy/status/recovery JSON 응답");
    expect(changelog).toContain("PR #618");
    expect(operability).toContain("Cloudflare deploy/status/recovery control-plane JSON");
    expect(operability).toContain("1 MiB ceiling");
    expect(operability).toContain("PR #618 adds a source-level transport invariant");
    expect(baseline).toContain(
      "merged PR #618 exact `fb166ec6ecc769a19fd4ae4502f6d0994fc89e33`",
    );
    expect(baseline).toContain("Protected #618 closes the Cloudflare control-plane transport resource-bound gap");
    expect(baseline).not.toContain("active PR #618");
    expect(baseline).toContain("120-second wall-clock `AbortSignal` bound");
    expect(baseline).toContain("ADR 0018 remains `Proposed`");
  });

  it("returns the Cloudflare result and accepts a body exactly at the byte ceiling", async () => {
    const text = JSON.stringify({ success: true, result: { id: "deployment" } });
    await expect(
      readBoundedCloudflareJsonResponse(
        new Response(text, { status: 200 }),
        "Worker deployment",
        Buffer.byteLength(text, "utf8"),
      ),
    ).resolves.toEqual({ id: "deployment" });
  });

  it("returns an unwrapped successful payload when result is absent", async () => {
    await expect(
      readBoundedCloudflareJsonResponse(jsonResponse({ deployments: [] }), "Worker status"),
    ).resolves.toEqual({ deployments: [] });
  });

  it("rejects invalid byte ceilings before reading a response", async () => {
    await expect(
      readBoundedCloudflareJsonResponse(jsonResponse({}), "Worker status", 1.5),
    ).rejects.toThrow("positive safe integer");
    await expect(
      readBoundedCloudflareJsonResponse(jsonResponse({}), "Worker status", 0),
    ).rejects.toThrow("positive safe integer");
  });

  it("rejects missing and non-stream-readable bodies", async () => {
    await expect(
      readBoundedCloudflareJsonResponse(
        { body: null, ok: true, status: 200 } as unknown as Response,
        "Worker status",
      ),
    ).rejects.toThrow("response body is not stream-readable");
    await expect(
      readBoundedCloudflareJsonResponse(
        { body: {}, ok: true, status: 200 } as unknown as Response,
        "Worker status",
      ),
    ).rejects.toThrow("response body is not stream-readable");
  });

  it("rejects malformed stream chunks and still releases the reader lock", async () => {
    const releaseLock = vi.fn();
    const reader = {
      read: vi.fn().mockResolvedValueOnce({ done: false, value: "not-bytes" }),
      cancel: vi.fn(),
      releaseLock,
    };
    await expect(
      readBoundedCloudflareJsonResponse(fakeResponse(reader), "Worker status"),
    ).rejects.toThrow("malformed response chunk");
    expect(releaseLock).toHaveBeenCalledOnce();
  });

  it("cancels an oversized stream before accepting bytes beyond the ceiling", async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    const releaseLock = vi.fn();
    const reader = {
      read: vi.fn()
        .mockResolvedValueOnce({ done: false, value: new Uint8Array([1, 2]) })
        .mockResolvedValueOnce({ done: false, value: new Uint8Array([3, 4]) }),
      cancel,
      releaseLock,
    };
    await expect(
      readBoundedCloudflareJsonResponse(fakeResponse(reader), "Worker status", 3),
    ).rejects.toThrow("oversized response");
    expect(cancel).toHaveBeenCalledWith("Cloudflare response byte ceiling exceeded");
    expect(releaseLock).toHaveBeenCalledOnce();
  });

  it("keeps the byte-ceiling failure authoritative when stream cancellation itself fails", async () => {
    const releaseLock = vi.fn();
    const reader = {
      read: vi.fn().mockResolvedValueOnce({ done: false, value: new Uint8Array([1, 2]) }),
      cancel: vi.fn().mockRejectedValue(new Error("cancel failed")),
      releaseLock,
    };
    await expect(
      readBoundedCloudflareJsonResponse(fakeResponse(reader), "Worker status", 1),
    ).rejects.toThrow("oversized response");
    expect(releaseLock).toHaveBeenCalledOnce();
  });

  it("rejects invalid UTF-8 and malformed JSON after bounded accumulation", async () => {
    await expect(
      readBoundedCloudflareJsonResponse(
        new Response(new Uint8Array([0xff]), { status: 200 }),
        "Worker status",
      ),
    ).rejects.toThrow("invalid UTF-8 (HTTP 200)");
    await expect(
      readBoundedCloudflareJsonResponse(
        new Response("not-json", { status: 200 }),
        "Worker status",
      ),
    ).rejects.toThrow("non-JSON data (HTTP 200)");
  });

  it("rejects provider-declared failures with normalized error codes", async () => {
    await expect(
      readBoundedCloudflareJsonResponse(
        jsonResponse({
          success: false,
          errors: [{ code: 1001 }, {}, { code: null }, { code: "" }, { code: "E2" }],
        }),
        "Worker deployment",
      ),
    ).rejects.toThrow("Worker deployment failed (HTTP 200; codes=1001,E2)");
  });

  it("rejects non-success HTTP responses even without a Cloudflare error array", async () => {
    await expect(
      readBoundedCloudflareJsonResponse(
        new Response(JSON.stringify({ message: "denied" }), { status: 403 }),
        "Worker deployment",
      ),
    ).rejects.toThrow("Worker deployment failed (HTTP 403)");
  });
});
