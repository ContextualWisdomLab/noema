import { describe, expect, it, vi } from "vitest";
import {
  createFailClosedFetch,
  isTrustedCredentialEgressRequest,
  type FetchLike,
} from "../src/outbound-fetch-policy";

const discoveryUrl = "https://token.actions.githubusercontent.com/.well-known/openid-configuration";
const jwksUrl = "https://token.actions.githubusercontent.com/.well-known/jwks";
const githubApiUrl = "https://api.github.com/app/installations";

describe("outbound credential request compartmentalization", () => {
  it("accepts only public GET-shaped OIDC metadata requests", () => {
    expect(isTrustedCredentialEgressRequest(discoveryUrl)).toBe(true);
    expect(isTrustedCredentialEgressRequest(new Request(jwksUrl))).toBe(true);
    expect(isTrustedCredentialEgressRequest(discoveryUrl, { body: undefined })).toBe(true);
  });

  it.each([
    ["non-GET method", { method: "POST" }],
    ["request body", { method: "GET", body: "{}" }],
    ["authorization header", { headers: { authorization: "Bearer sensitive" } }],
    ["cookie header", { headers: { cookie: "session=sensitive" } }],
    ["proxy authorization header", { headers: { "proxy-authorization": "Basic sensitive" } }],
  ] satisfies Array<[string, RequestInit]>) (
    "rejects OIDC metadata traffic with a %s",
    (_label, init) => {
      expect(isTrustedCredentialEgressRequest(discoveryUrl, init)).toBe(false);
    },
  );

  it("derives the effective request from Request input plus RequestInit overrides", () => {
    const unsafeInput = new Request(discoveryUrl, {
      method: "POST",
      headers: { authorization: "Bearer sensitive" },
      body: "credential-bearing body",
    });

    expect(isTrustedCredentialEgressRequest(unsafeInput)).toBe(false);
    expect(isTrustedCredentialEgressRequest(unsafeInput, {
      method: "GET",
      headers: {},
      body: null,
    })).toBe(true);
  });

  it("allows reviewed GitHub REST GET and POST credential shapes", () => {
    expect(isTrustedCredentialEgressRequest("https://api.github.com/meta")).toBe(true);
    expect(isTrustedCredentialEgressRequest(new Request(githubApiUrl, {
      headers: { authorization: "Bearer app-jwt" },
    }))).toBe(true);
    expect(isTrustedCredentialEgressRequest(githubApiUrl, {
      method: "POST",
      headers: { authorization: "Bearer app-jwt" },
      body: "{}",
    })).toBe(true);
  });

  it("rejects ambient credentials and unsupported authenticated GitHub REST operations", () => {
    expect(isTrustedCredentialEgressRequest(githubApiUrl, {
      headers: { cookie: "session=sensitive" },
    })).toBe(false);
    expect(isTrustedCredentialEgressRequest(githubApiUrl, {
      headers: { "proxy-authorization": "Basic sensitive" },
    })).toBe(false);
    expect(isTrustedCredentialEgressRequest(githubApiUrl, {
      method: "DELETE",
      headers: { authorization: "Bearer app-jwt" },
    })).toBe(false);

    const bodyBearingRequest = new Request(githubApiUrl, {
      method: "POST",
      headers: { authorization: "Bearer app-jwt" },
      body: "{}",
    });
    expect(isTrustedCredentialEgressRequest(bodyBearingRequest, {
      method: "GET",
    })).toBe(false);
  });

  it("rejects untrusted destinations before deriving a request policy", () => {
    expect(isTrustedCredentialEgressRequest("https://evil.example/collect", {
      method: "POST",
      headers: { authorization: "Bearer sensitive" },
      body: "secret",
    })).toBe(false);
  });

  it("blocks request-policy violations before the network call", async () => {
    const rawFetch = vi.fn<FetchLike>();
    const wrapped = createFailClosedFetch(rawFetch);

    const oidcResponse = await wrapped(discoveryUrl, {
      headers: { authorization: "Bearer app-jwt" },
    });
    const githubResponse = await wrapped(githubApiUrl, {
      method: "PATCH",
      headers: { authorization: "Bearer app-jwt" },
      body: "{}",
    });

    expect(rawFetch).not.toHaveBeenCalled();
    for (const response of [oidcResponse, githubResponse]) {
      expect(response.status).toBe(502);
      expect(response.headers.get("x-noema-egress-policy")).toBe("blocked-request-policy");
      expect(response.headers.get("location")).toBeNull();
      expect(await response.text()).toBe("");
    }
  });
});
