import { describe, expect, it, vi } from "vitest";
import {
  createFailClosedFetch,
  type FetchLike,
} from "../src/outbound-fetch-policy";

const tokenUrl = "https://api.github.com/app/installations/12345/access_tokens";
const tokenBody = JSON.stringify({
  repositories: ["noema"],
  permissions: {
    contents: "read",
    pull_requests: "write",
    checks: "read",
  },
});

describe("installation-token outbound media type", () => {
  it.each([
    ["record", { authorization: "Bearer app-jwt" }],
    ["tuple list", [["authorization", "Bearer app-jwt"]] as [string, string][]],
  ])("adds exact application/json before %s headers cross the network boundary", async (_label, headers) => {
    const rawFetch = vi.fn<FetchLike>(async () => Response.json({ token: "issued" }));
    const wrapped = createFailClosedFetch(rawFetch);

    const response = await wrapped(tokenUrl, {
      method: "POST",
      headers,
      body: tokenBody,
    });

    expect(response.status).toBe(200);
    expect(rawFetch).toHaveBeenCalledOnce();
    const forwarded = new Headers(rawFetch.mock.calls[0][1]?.headers);
    expect(forwarded.get("authorization")).toBe("Bearer app-jwt");
    expect(forwarded.get("content-type")).toBe("application/json");
  });

  it("rejects a caller-supplied non-JSON media type rather than overriding it", async () => {
    const rawFetch = vi.fn<FetchLike>();
    const wrapped = createFailClosedFetch(rawFetch);

    const response = await wrapped(tokenUrl, {
      method: "POST",
      headers: {
        authorization: "Bearer app-jwt",
        "content-type": "text/plain;charset=UTF-8",
      },
      body: tokenBody,
    });

    expect(response.status).toBe(502);
    expect(response.headers.get("x-noema-egress-policy")).toBe("blocked-request-policy");
    expect(rawFetch).not.toHaveBeenCalled();
  });

  it("does not promote pre-normalized Headers whose credential framing is no longer observable", async () => {
    const rawFetch = vi.fn<FetchLike>();
    const wrapped = createFailClosedFetch(rawFetch);

    const response = await wrapped(tokenUrl, {
      method: "POST",
      headers: new Headers({ authorization: "Bearer app-jwt" }),
      body: tokenBody,
    });

    expect(response.status).toBe(502);
    expect(response.headers.get("x-noema-egress-policy")).toBe("blocked-request-policy");
    expect(rawFetch).not.toHaveBeenCalled();
  });
});
