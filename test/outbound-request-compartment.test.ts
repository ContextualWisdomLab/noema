import { describe, expect, it, vi } from "vitest";
import {
  createFailClosedFetch,
  isTrustedCredentialEgressRequest,
  type FetchLike,
} from "../src/outbound-fetch-policy";

const discoveryUrl = "https://token.actions.githubusercontent.com/.well-known/openid-configuration";
const jwksUrl = "https://token.actions.githubusercontent.com/.well-known/jwks";
const repositoryInstallationUrl =
  "https://api.github.com/repos/ContextualWisdomLab/noema/installation";
const installationTokenUrl =
  "https://api.github.com/app/installations/12345/access_tokens";
const unrelatedGithubApiUrl = "https://api.github.com/meta";

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

  it("allows public bodyless GitHub GETs and only the two reviewed App-JWT operations", () => {
    expect(isTrustedCredentialEgressRequest(unrelatedGithubApiUrl)).toBe(true);
    expect(isTrustedCredentialEgressRequest(new Request(repositoryInstallationUrl, {
      headers: { authorization: "Bearer app-jwt" },
    }))).toBe(true);
    expect(isTrustedCredentialEgressRequest(installationTokenUrl, {
      method: "POST",
      headers: { authorization: "Bearer app-jwt" },
      body: "{}",
    })).toBe(true);
  });

  it.each([
    [
      "an unreviewed authenticated endpoint",
      unrelatedGithubApiUrl,
      { headers: { authorization: "Bearer app-jwt" } },
    ],
    [
      "a query string on repository installation lookup",
      `${repositoryInstallationUrl}?redirect=true`,
      { headers: { authorization: "Bearer app-jwt" } },
    ],
    [
      "a nonnumeric installation id",
      "https://api.github.com/app/installations/current/access_tokens",
      { method: "POST", headers: { authorization: "Bearer app-jwt" }, body: "{}" },
    ],
    [
      "an encoded dot-segment repository path",
      "https://api.github.com/repos/ContextualWisdomLab/%2e%2e/installation",
      { headers: { authorization: "Bearer app-jwt" } },
    ],
    [
      "a body on repository installation lookup",
      repositoryInstallationUrl,
      { headers: { authorization: "Bearer app-jwt" }, body: "{}" },
    ],
    [
      "POST on repository installation lookup",
      repositoryInstallationUrl,
      { method: "POST", headers: { authorization: "Bearer app-jwt" }, body: "{}" },
    ],
    [
      "GET on installation-token issuance",
      installationTokenUrl,
      { headers: { authorization: "Bearer app-jwt" } },
    ],
    [
      "a missing body on installation-token issuance",
      installationTokenUrl,
      { method: "POST", headers: { authorization: "Bearer app-jwt" } },
    ],
    [
      "a missing credential on a GitHub POST",
      installationTokenUrl,
      { method: "POST", body: "{}" },
    ],
    [
      "a malformed authorization scheme",
      repositoryInstallationUrl,
      { headers: { authorization: "Basic app-jwt" } },
    ],
    [
      "a cookie",
      repositoryInstallationUrl,
      { headers: { authorization: "Bearer app-jwt", cookie: "session=sensitive" } },
    ],
    [
      "proxy authorization",
      repositoryInstallationUrl,
      { headers: { authorization: "Bearer app-jwt", "proxy-authorization": "Basic sensitive" } },
    ],
    [
      "an HTTP method override",
      repositoryInstallationUrl,
      { headers: { authorization: "Bearer app-jwt", "x-http-method-override": "DELETE" } },
    ],
    [
      "an alternate method override",
      repositoryInstallationUrl,
      { headers: { authorization: "Bearer app-jwt", "x-method-override": "DELETE" } },
    ],
  ] satisfies Array<[string, string, RequestInit]>) (
    "rejects GitHub REST traffic with %s",
    (_label, url, init) => {
      expect(isTrustedCredentialEgressRequest(url, init)).toBe(false);
    },
  );

  it("rejects an untrusted destination before deriving a request policy", () => {
    expect(isTrustedCredentialEgressRequest("https://evil.example/collect", {
      method: "POST",
      headers: { authorization: "Bearer sensitive" },
      body: "secret",
    })).toBe(false);
  });

  it("blocks endpoint-policy violations before the network call", async () => {
    const rawFetch = vi.fn<FetchLike>();
    const wrapped = createFailClosedFetch(rawFetch);

    const oidcResponse = await wrapped(discoveryUrl, {
      headers: { authorization: "Bearer app-jwt" },
    });
    const githubResponse = await wrapped(unrelatedGithubApiUrl, {
      method: "POST",
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
