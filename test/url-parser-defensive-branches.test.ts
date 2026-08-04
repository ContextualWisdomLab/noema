import { afterEach, describe, expect, it, vi } from "vitest";
import { isTrustedGithubApiBase } from "../src/entrypoint";
import { trustedClientIdentifier } from "../src/rate-limit";

function requestWithClientIp(value: string): Request {
  return new Request("https://noema.example/exchange", {
    headers: { "cf-connecting-ip": value },
  });
}

describe("URL parser defensive branches", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fails closed when the runtime URL parser rejects an otherwise allowlisted origin", () => {
    vi.stubGlobal("URL", class RejectingUrlParser {
      constructor() {
        throw new TypeError("simulated URL parser failure");
      }
    });

    expect(isTrustedGithubApiBase("https://api.github.com")).toBe(false);
  });

  it.each([
    ["missing opening bracket", "2001:db8::1"],
    ["missing closing bracket", "[2001:db8::1"],
    ["non-IPv6 normalized hostname", "[not-an-ip]"],
  ])("rejects a runtime IPv6 hostname with %s", (_case, hostname) => {
    const request = requestWithClientIp("2001:db8::1");
    vi.stubGlobal("URL", class StubbedUrlParser {
      readonly hostname = hostname;
    });

    expect(trustedClientIdentifier(request)).toBeUndefined();
  });
});
