import { describe, expect, it, vi } from "vitest";
import {
  createFailClosedFetch,
  type FetchLike,
} from "../src/outbound-fetch-policy";

describe("outbound header authority", () => {
  it.each([
    [
      "credential-bearing GitHub API",
      "https://api.github.com/repos/ContextualWisdomLab/noema/installation",
      {
        headers: {
          authorization: "Bearer sensitive",
          "x-noema-unreviewed-secret": "sensitive-marker",
        },
      },
    ],
    [
      "GitHub OIDC metadata",
      "https://token.actions.githubusercontent.com/.well-known/openid-configuration",
      {
        headers: {
          "x-noema-unreviewed-secret": "sensitive-marker",
        },
      },
    ],
  ])("rejects unreviewed caller header authority before %s egress", async (_label, url, init) => {
    const rawFetch = vi.fn<FetchLike>(async () => new Response("unexpected network"));
    const wrapped = createFailClosedFetch(rawFetch);

    const response = await wrapped(url, init);

    expect(rawFetch).not.toHaveBeenCalled();
    expect(response.status).toBe(502);
    expect(response.headers.get("x-noema-egress-policy")).toBe("blocked-request-policy");
    expect(await response.text()).toBe("");
  });

  it("rejects a reviewed GitHub API header name with a noncanonical value", async () => {
    const rawFetch = vi.fn<FetchLike>(async () => new Response("unexpected network"));
    const wrapped = createFailClosedFetch(rawFetch);

    const response = await wrapped(
      "https://api.github.com/repos/ContextualWisdomLab/noema/installation",
      {
        method: "GET",
        headers: {
          authorization: "Bearer sensitive",
          accept: "application/json",
        },
      },
    );

    expect(rawFetch).not.toHaveBeenCalled();
    expect(response.status).toBe(502);
    expect(response.headers.get("x-noema-egress-policy")).toBe("blocked-request-policy");
    expect(await response.text()).toBe("");
  });
});
