import { afterEach, describe, expect, it, vi } from "vitest";
import entrypoint, {
  boundExchangeJsonBody,
  type Env,
} from "../src/entrypoint";

function lockedJsonRequest(traceId: string): Request {
  const request = new Request("https://noema.example/exchange", {
    method: "POST",
    headers: {
      authorization: "Bearer a.b.c",
      "content-type": "application/json",
      "x-request-id": traceId,
    },
    body: "{}",
  });
  vi.spyOn(request.body!, "getReader").mockImplementation(() => {
    throw new TypeError("simulated locked exchange request body");
  });
  return request;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("exchange JSON locked reader acquisition", () => {
  it("normalizes a locked request body to the existing unreadable boundary", async () => {
    const request = lockedJsonRequest("locked-body-direct");

    await expect(boundExchangeJsonBody(request)).resolves.toEqual({
      ok: false,
      failure: { reason: "unreadable", status: 400 },
    });
  });

  it("returns the stable public 400 contract before credential egress", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const request = lockedJsonRequest("locked-body-public");

    const response = await entrypoint.fetch(
      request,
      { GITHUB_API_BASE: "https://api.github.com" } as Env,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_VALIDATION_INPUT",
      message: "Exchange JSON body could not be read",
      details: {
        policy: "bounded-exchange-json-body",
        reason: "unreadable",
      },
      trace_id: "locked-body-public",
    });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('\"reason\":\"unreadable\"'));
  });
});
