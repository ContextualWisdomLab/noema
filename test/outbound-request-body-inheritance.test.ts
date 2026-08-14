import { describe, expect, it, vi } from "vitest";
import { createFailClosedFetch } from "../src/outbound-fetch-policy";

const discoveryUrl =
  "https://token.actions.githubusercontent.com/.well-known/openid-configuration";

describe("outbound request body inheritance", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
  ] as const)(
    "rejects an inherited Request body when RequestInit.body is %s",
    async (_label, bodyOverride) => {
      const rawFetch = vi.fn(async () => new Response("unexpected", { status: 200 }));
      const guardedFetch = createFailClosedFetch(rawFetch);
      const bodyfulRequest = new Request(discoveryUrl, {
        method: "POST",
        body: "credential-bearing payload",
      });

      const response = await guardedFetch(bodyfulRequest, {
        method: "GET",
        body: bodyOverride,
      });

      expect(response.status).toBe(502);
      expect(response.headers.get("x-noema-egress-policy")).toBe(
        "blocked-request-policy",
      );
      expect(rawFetch).not.toHaveBeenCalled();
    },
  );
});
