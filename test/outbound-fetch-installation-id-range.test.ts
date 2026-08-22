import { describe, expect, it } from "vitest";
import { isTrustedCredentialEgressRequest } from "../src/outbound-fetch-policy";

const body = JSON.stringify({
  repositories: ["noema"],
  permissions: {
    contents: "read",
    pull_requests: "write",
    checks: "read",
  },
});

function requestFor(id: string) {
  return isTrustedCredentialEgressRequest(
    `https://api.github.com/app/installations/${id}/access_tokens`,
    {
      method: "POST",
      headers: {
        authorization: "Bearer app-jwt",
        "content-type": "application/json",
      },
      body,
    },
  );
}

describe("credential egress installation-id authority", () => {
  it("accepts the maximum canonical safe integer installation id", () => {
    expect(requestFor(String(Number.MAX_SAFE_INTEGER))).toBe(true);
  });

  it.each([
    "9007199254740992",
    "9999999999999999999999999999999999999999",
  ])("rejects an installation id outside the JavaScript safe-integer boundary: %s", (id) => {
    expect(requestFor(id)).toBe(false);
  });
});
