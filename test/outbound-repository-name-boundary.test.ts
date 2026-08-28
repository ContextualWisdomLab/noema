import { describe, expect, it, vi } from "vitest";

import {
  createFailClosedFetch,
  type FetchLike,
} from "../src/outbound-fetch-policy";

function installationTokenRequest(repository: string): RequestInit {
  return {
    method: "POST",
    headers: { authorization: "Bearer sensitive" },
    body: JSON.stringify({
      repositories: [repository],
      permissions: {
        pull_requests: "write",
        contents: "read",
        checks: "read",
      },
    }),
  };
}

describe("credential-egress repository-name boundary", () => {
  it("allows a 100-character GitHub repository name and blocks a 101-character scope before credential egress", async () => {
    const rawFetch = vi.fn<FetchLike>(async () => Response.json({ ok: true }));
    const wrapped = createFailClosedFetch(rawFetch);
    const endpoint = "https://api.github.com/app/installations/1/access_tokens";

    const allowed = await wrapped(endpoint, installationTokenRequest("r".repeat(100)));
    expect(allowed.status).toBe(200);
    expect(rawFetch).toHaveBeenCalledOnce();

    rawFetch.mockClear();
    const blocked = await wrapped(endpoint, installationTokenRequest("r".repeat(101)));

    expect(rawFetch).not.toHaveBeenCalled();
    expect(blocked.status).toBe(502);
    expect(blocked.headers.get("x-noema-egress-policy")).toBe("blocked-request-policy");
  });
});
