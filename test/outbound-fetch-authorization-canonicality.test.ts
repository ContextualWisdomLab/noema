import { describe, expect, it } from "vitest";
import { isTrustedCredentialEgressRequest } from "../src/outbound-fetch-policy";

const installationLookup = "https://api.github.com/app/installations";

describe("credential-egress Authorization framing", () => {
  it("accepts exactly one ASCII space between Bearer and the credential", () => {
    expect(isTrustedCredentialEgressRequest(installationLookup, {
      method: "GET",
      headers: { authorization: "Bearer canonical-token" },
    })).toBe(true);
  });

  it.each([
    "Bearer\tcanonical-token",
    "Bearer  canonical-token",
    "Bearer\u00a0canonical-token",
  ])("rejects non-canonical Bearer separators before credential egress: %s", (authorization) => {
    expect(isTrustedCredentialEgressRequest(installationLookup, {
      method: "GET",
      headers: { authorization },
    })).toBe(false);
  });
});
