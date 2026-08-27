import { describe, expect, it } from "vitest";
import { isTrustedCredentialEgress } from "../src/outbound-fetch-policy";

describe("credential-egress URL authority", () => {
  it("does not normalize raw string aliases into trusted GitHub destinations", () => {
    expect(isTrustedCredentialEgress(" https://api.github.com/app/installations")).toBe(false);
    expect(isTrustedCredentialEgress("https://api.github.com/app/installations ")).toBe(false);
    expect(isTrustedCredentialEgress("https://api.github.com:443/app/installations")).toBe(false);
    expect(isTrustedCredentialEgress("https://API.GITHUB.COM/app/installations")).toBe(false);
  });

  it("preserves canonical string and already-parsed URL authority", () => {
    expect(isTrustedCredentialEgress("https://api.github.com/app/installations")).toBe(true);
    expect(isTrustedCredentialEgress(new URL("https://api.github.com:443/app/installations"))).toBe(true);
  });
});
