import { describe, expect, it } from "vitest";
import { boundExchangeJsonBody } from "../src/entrypoint";

function jsonRequest(body: string): Request {
  return new Request("https://noema.example/exchange", {
    method: "POST",
    headers: {
      authorization: "Bearer a.b.c",
      "content-type": "application/json",
    },
    body,
  });
}

describe("exchange JSON object shape", () => {
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
});
