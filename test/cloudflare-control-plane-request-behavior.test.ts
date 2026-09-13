import { afterEach, describe, expect, it, vi } from "vitest";
import { requestCloudflareJson } from "../scripts/lib/cloudflare-response.mjs";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Cloudflare control-plane request behavior", () => {
  it("enforces JSON negotiation and delegated authorization on the actual fetch boundary", async () => {
    const timeoutSignal = new AbortController().signal;
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(timeoutSignal);
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ success: true, result: { accepted: true } }),
      { status: 200, headers: { "content-type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestCloudflareJson(
      "https://api.cloudflare.com/client/v4/accounts/example/workers/scripts/noema/deployments",
      "canonical-token",
      "Worker control-plane test",
      {
        method: "POST",
        headers: {
          accept: "text/html",
          authorization: "Bearer caller-controlled-token",
          "content-type": "application/json",
        },
        body: "{}",
      },
    );

    expect(timeout).toHaveBeenCalledOnce();
    expect(timeout).toHaveBeenCalledWith(120_000);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] ?? [];
    const headers = new Headers(init?.headers);
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("authorization")).toBe("Bearer canonical-token");
    expect(headers.get("content-type")).toBe("application/json");
    expect(init?.signal).toBe(timeoutSignal);
    expect(result).toEqual({ accepted: true });
  });

  it("covers the default request init while honoring an explicit response ceiling", async () => {
    const timeoutSignal = new AbortController().signal;
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(timeoutSignal);
    const text = JSON.stringify({ success: true, result: { accepted: "default-init" } });
    const fetchMock = vi.fn(async () => new Response(text, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      requestCloudflareJson(
        "https://api.cloudflare.com/client/v4/accounts/example/workers/scripts/noema/deployments",
        "canonical-token",
        "Worker control-plane default-init test",
        undefined,
        Buffer.byteLength(text, "utf8"),
      ),
    ).resolves.toEqual({ accepted: "default-init" });

    expect(timeout).toHaveBeenCalledOnce();
    expect(timeout).toHaveBeenCalledWith(120_000);
    const [, init] = fetchMock.mock.calls[0] ?? [];
    const headers = new Headers(init?.headers);
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("authorization")).toBe("Bearer canonical-token");
    expect(init?.signal).toBe(timeoutSignal);
  });
});
