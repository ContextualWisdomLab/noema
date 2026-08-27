import { afterEach, describe, expect, it, vi } from "vitest";
import entrypoint, {
  boundExchangeJsonBody,
  type Env,
} from "../src/entrypoint";
import {
  resetGlobalOutboundFetchPolicy,
  type FetchHost,
} from "../src/outbound-fetch-policy";

const nativeFetch = globalThis.fetch;
const validEnvelope = "Bearer a.b.c";

function exchangeRequest(body: string, traceId = "exact-body-schema"): Request {
  return new Request("https://noema.example/exchange", {
    method: "POST",
    headers: {
      authorization: validEnvelope,
      "content-type": "application/json",
      "x-request-id": traceId,
    },
    body,
  });
}

describe("exchange JSON exact schema", () => {
  afterEach(() => {
    resetGlobalOutboundFetchPolicy();
    (globalThis as FetchHost).fetch = nativeFetch;
    vi.restoreAllMocks();
  });

  it("rejects unreviewed top-level request members instead of silently ignoring them", async () => {
    const typoBody = '{"target_repositroy":"ContextualWisdomLab/noema"}';

    await expect(boundExchangeJsonBody(exchangeRequest(typoBody))).resolves.toEqual({
      ok: false,
      failure: { reason: "unknown_fields", status: 400 },
    });
  });

  it("rejects unknown request authority before credential egress without reflecting body bytes", async () => {
    const unreviewedBody = '{"target_repository":"ContextualWisdomLab/noema","unexpected_authority":"sensitive-marker"}';
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const response = await entrypoint.fetch(
      exchangeRequest(unreviewedBody),
      {
        GITHUB_API_BASE: "https://example.com",
        GITHUB_APP_ID: "123456",
      } as Env,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_VALIDATION_INPUT",
      message: "Exchange JSON body contains unreviewed fields",
      details: {
        policy: "bounded-exchange-json-body",
        reason: "unknown_fields",
      },
      trace_id: "exact-body-schema",
    });
    expect(globalThis.fetch).toBe(nativeFetch);
    const logs = logSpy.mock.calls.flat().join("\n");
    expect(logs).toContain('"reason":"unknown_fields"');
    expect(logs).not.toContain("unexpected_authority");
    expect(logs).not.toContain("sensitive-marker");
  });
});
