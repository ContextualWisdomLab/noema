import { describe, expect, it, vi } from "vitest";
import { NoemaOidcReplayGuard } from "../src/oidc-replay";

function noStorageState(transaction: ReturnType<typeof vi.fn>): DurableObjectState {
  return {
    storage: { transaction },
  } as unknown as DurableObjectState;
}

function claimBody(padding = ""): string {
  return JSON.stringify({
    expires_at_epoch_seconds: 2_600,
    ...(padding ? { padding } : {}),
  });
}

describe("OIDC replay guard request-body bounds", () => {
  it("rejects an oversized declared internal claim body before storage authority", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    const transaction = vi.fn(async () => {
      throw new Error("storage must not be reached for an oversized request");
    });
    const guard = new NoemaOidcReplayGuard(noStorageState(transaction));
    const request = new Request("https://noema-oidc-replay.internal/claim", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": "513",
      },
      body: claimBody(),
    });

    const response = await guard.fetch(request);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "request_too_large",
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects a bodyless JSON claim as malformed before storage authority", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    const transaction = vi.fn(async () => {
      throw new Error("storage must not be reached for a bodyless claim request");
    });
    const guard = new NoemaOidcReplayGuard(noStorageState(transaction));
    const request = new Request("https://noema-oidc-replay.internal/claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
    });

    const response = await guard.fetch(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "malformed_json",
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects invalid UTF-8 claim bytes before storage authority", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    const transaction = vi.fn(async () => {
      throw new Error("storage must not be reached for invalid UTF-8 claim bytes");
    });
    const guard = new NoemaOidcReplayGuard(noStorageState(transaction));
    const request = new Request("https://noema-oidc-replay.internal/claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: new Uint8Array([0xc3, 0x28]),
    });

    const response = await guard.fetch(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "malformed_json",
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects a streamed internal claim body that exceeds the byte limit before storage authority", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    const transaction = vi.fn(async () => {
      throw new Error("storage must not be reached for an oversized request");
    });
    const guard = new NoemaOidcReplayGuard(noStorageState(transaction));
    const request = new Request("https://noema-oidc-replay.internal/claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: claimBody("x".repeat(600)),
    });

    const response = await guard.fetch(request);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "request_too_large",
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("cleans up a claim stream that fails while being read before storage authority", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    const transaction = vi.fn(async () => {
      throw new Error("storage must not be reached after a replay request read failure");
    });
    const guard = new NoemaOidcReplayGuard(noStorageState(transaction));
    const request = new Request("https://noema-oidc-replay.internal/claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: claimBody(),
    });
    const cancel = vi.fn(async () => undefined);
    vi.spyOn(request.body!, "getReader").mockReturnValue({
      read: vi.fn(async () => {
        throw new Error("synthetic replay claim read failure");
      }),
      cancel,
    } as unknown as ReadableStreamDefaultReader<Uint8Array>);

    const response = await guard.fetch(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "malformed_json",
    });
    expect(cancel).toHaveBeenCalledOnce();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("cleans up an unsupported-media-type claim body without letting cleanup failure replace 415", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    const transaction = vi.fn(async () => {
      throw new Error("storage must not be reached for an unsupported claim request");
    });
    const guard = new NoemaOidcReplayGuard(noStorageState(transaction));
    const request = new Request("https://noema-oidc-replay.internal/claim", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: claimBody(),
    });
    const cancel = vi.spyOn(request.body!, "cancel").mockImplementation(() => {
      throw new Error("synthetic cancellation failure");
    });

    const response = await guard.fetch(request);

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "content_type_required",
    });
    expect(cancel).toHaveBeenCalledOnce();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("cleans up a wrong-path claim body without letting cleanup failure replace 404", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    const transaction = vi.fn(async () => {
      throw new Error("storage must not be reached for a wrong-path claim request");
    });
    const guard = new NoemaOidcReplayGuard(noStorageState(transaction));
    const request = new Request("https://noema-oidc-replay.internal/not-claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: claimBody(),
    });
    const cancel = vi.spyOn(request.body!, "cancel").mockImplementation(() => {
      throw new Error("synthetic cancellation failure");
    });

    const response = await guard.fetch(request);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "not_found",
    });
    expect(cancel).toHaveBeenCalledOnce();
    expect(transaction).not.toHaveBeenCalled();
  });
});