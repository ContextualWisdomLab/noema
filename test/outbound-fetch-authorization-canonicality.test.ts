import { describe, expect, it } from "vitest";
import { isTrustedCredentialEgressRequest } from "../src/outbound-fetch-policy";

const installationLookup = "https://api.github.com/app/installations";

describe("credential-egress Authorization framing", () => {
  it("accepts exactly one ASCII space between Bearer and the credential from raw RequestInit headers", () => {
    expect(isTrustedCredentialEgressRequest(installationLookup, {
      method: "GET",
      headers: { authorization: "Bearer canonical-token", accept: "application/json" },
    })).toBe(true);
    expect(isTrustedCredentialEgressRequest(installationLookup, {
      method: "GET",
      headers: [["authorization", "Bearer canonical-token"]],
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

  it.each([
    " Bearer canonical-token",
    "\tBearer canonical-token",
    "Bearer canonical-token ",
    "Bearer canonical-token\t",
  ])("rejects credential framing that Headers would silently trim: %s", (authorization) => {
    expect(isTrustedCredentialEgressRequest(installationLookup, {
      method: "GET",
      headers: { authorization },
    })).toBe(false);
  });

  it("rejects pre-normalized authorization containers whose original framing is no longer observable", () => {
    expect(isTrustedCredentialEgressRequest(installationLookup, {
      method: "GET",
      headers: new Headers({ authorization: "Bearer canonical-token" }),
    })).toBe(false);
    expect(isTrustedCredentialEgressRequest(new Request(installationLookup, {
      headers: { authorization: "Bearer canonical-token" },
    }))).toBe(false);
  });

  it("rejects duplicate raw authorization fields before Headers can combine them", () => {
    expect(isTrustedCredentialEgressRequest(installationLookup, {
      method: "GET",
      headers: [
        ["authorization", "Bearer canonical-token"],
        ["Authorization", "Bearer second-token"],
      ],
    })).toBe(false);
  });
});
