import { describe, expect, it, vi } from "vitest";
import {
  createFailClosedFetch,
  isTrustedCredentialEgressRequest,
  type FetchLike,
} from "../src/outbound-fetch-policy";

describe("anonymous GitHub API egress authority", () => {
  it.each([
    "https://api.github.com/meta",
    "https://api.github.com/search/issues?q=credential-material",
    "https://api.github.com/repos/attacker-controlled/example",
  ])("rejects an unreviewed unauthenticated GitHub API request: %s", (url) => {
    expect(isTrustedCredentialEgressRequest(url)).toBe(false);
  });

  it("blocks anonymous GitHub API egress before the network call", async () => {
    const rawFetch = vi.fn<FetchLike>();
    const wrapped = createFailClosedFetch(rawFetch);

    const response = await wrapped(
      "https://api.github.com/search/issues?q=credential-material",
    );

    expect(rawFetch).not.toHaveBeenCalled();
    expect(response.status).toBe(502);
    expect(response.headers.get("x-noema-egress-policy")).toBe("blocked-request-policy");
    expect(await response.text()).toBe("");
  });
});
