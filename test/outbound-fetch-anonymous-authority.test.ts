import { describe, expect, it, vi } from "vitest";

import {
  createFailClosedFetch,
  isTrustedCredentialEgress,
  isTrustedCredentialEgressRequest,
  type FetchLike,
} from "../src/outbound-fetch-policy";

describe("anonymous GitHub API egress authority", () => {
  it("admits only the exact bodyless /meta diagnostic without credentials", async () => {
    const installationUrl = "https://api.github.com/repos/ContextualWisdomLab/noema/installation";

    expect(isTrustedCredentialEgress("https://api.github.com/meta")).toBe(true);
    expect(isTrustedCredentialEgressRequest("https://api.github.com/meta")).toBe(true);
    expect(isTrustedCredentialEgress(installationUrl)).toBe(true);
    expect(isTrustedCredentialEgressRequest(installationUrl)).toBe(false);

    const rawFetch = vi.fn<FetchLike>(async () => new Response(null, { status: 204 }));
    const wrapped = createFailClosedFetch(rawFetch);

    const response = await wrapped(installationUrl);

    expect(rawFetch).not.toHaveBeenCalled();
    expect(response.status).toBe(502);
    expect(response.headers.get("x-noema-egress-policy")).toBe("blocked-request-policy");
  });

  it("rejects reviewed headers on the anonymous /meta diagnostic", async () => {
    const metaUrl = "https://api.github.com/meta";
    const request = {
      method: "GET",
      headers: { accept: "application/vnd.github+json" },
    } satisfies RequestInit;

    expect(isTrustedCredentialEgressRequest(metaUrl, request)).toBe(false);

    const rawFetch = vi.fn<FetchLike>(async () => new Response(null, { status: 204 }));
    const wrapped = createFailClosedFetch(rawFetch);
    const response = await wrapped(metaUrl, request);

    expect(rawFetch).not.toHaveBeenCalled();
    expect(response.status).toBe(502);
    expect(response.headers.get("x-noema-egress-policy")).toBe("blocked-request-policy");
  });

  it("rejects arbitrary anonymous GitHub REST destinations outside reviewed operations", async () => {
    const unreviewedUrl = "https://api.github.com/repos/ContextualWisdomLab/noema/issues";

    expect(isTrustedCredentialEgress(unreviewedUrl)).toBe(false);

    const rawFetch = vi.fn<FetchLike>();
    const wrapped = createFailClosedFetch(rawFetch);
    const response = await wrapped(unreviewedUrl);

    expect(rawFetch).not.toHaveBeenCalled();
    expect(response.status).toBe(502);
    expect(response.headers.get("x-noema-egress-policy")).toBe("blocked-destination");
  });
});
