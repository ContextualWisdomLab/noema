import { afterEach, describe, expect, it, vi } from "vitest";
import entrypoint, {
  boundExchangeJsonBody,
  type Env,
} from "../src/entrypoint";

function jsonRequest(body: string, requestId?: string): Request {
  return new Request("https://noema.example/exchange", {
    method: "POST",
    headers: {
      authorization: "Bearer a.b.c",
      "content-type": "application/json",
      ...(requestId ? { "x-request-id": requestId } : {}),
    },
    body,
  });
}

describe("exchange JSON object shape", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["array", "[]"],
    ["null", "null"],
    ["string", '"ContextualWisdomLab/noema"'],
    ["number", "42"],
    ["boolean", "true"],
  ])("rejects a valid JSON %s before credential-bearing work", async (_label, body) => {
    await expect(boundExchangeJsonBody(jsonRequest(body))).resolves.toEqual({
      ok: false,
      failure: { reason: "invalid_shape", status: 400 },
    });
  });

  it("returns a no-store invalid-shape response before GitHub egress configuration", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const response = await entrypoint.fetch(
      jsonRequest("[]", "invalid-json-shape"),
      { GITHUB_API_BASE: "https://example.invalid" } as Env,
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-trace-id")).toBe("invalid-json-shape");
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_VALIDATION_INPUT",
      message: "Exchange JSON body must be an object",
      details: {
        policy: "bounded-exchange-json-body",
        body_limit_bytes: "8192",
        reason: "invalid_shape",
      },
      trace_id: "invalid-json-shape",
    });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('"reason":"invalid_shape"'));
  });
});
