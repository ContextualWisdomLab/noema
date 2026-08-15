import { describe, expect, it } from "vitest";
import { isTrustedCredentialEgressRequest } from "../src/outbound-fetch-policy";

const installationTokenUrl =
  "https://api.github.com/app/installations/12345/access_tokens";
const authorization = { authorization: "Bearer app-jwt" };
const leastPrivilegeBody = JSON.stringify({
  repositories: ["noema"],
  permissions: {
    pull_requests: "write",
    contents: "read",
    checks: "read",
  },
});

describe("installation token scope policy", () => {
  it("accepts only the repository-scoped least-privilege token request used by Noema", () => {
    expect(isTrustedCredentialEgressRequest(installationTokenUrl, {
      method: "POST",
      headers: authorization,
      body: leastPrivilegeBody,
    })).toBe(true);
  });

  it.each([
    ["empty object that would inherit the App installation scope", "{}"],
    [
      "multiple repositories",
      JSON.stringify({
        repositories: ["noema", "another-repository"],
        permissions: { pull_requests: "write", contents: "read", checks: "read" },
      }),
    ],
    [
      "repository ids instead of one explicit repository name",
      JSON.stringify({
        repository_ids: [1],
        permissions: { pull_requests: "write", contents: "read", checks: "read" },
      }),
    ],
    [
      "broader contents permission",
      JSON.stringify({
        repositories: ["noema"],
        permissions: { pull_requests: "write", contents: "write", checks: "read" },
      }),
    ],
    [
      "an extra permission",
      JSON.stringify({
        repositories: ["noema"],
        permissions: {
          pull_requests: "write",
          contents: "read",
          checks: "read",
          administration: "read",
        },
      }),
    ],
    ["malformed JSON", "{not-json"],
  ])("rejects %s", (_label, body) => {
    expect(isTrustedCredentialEgressRequest(installationTokenUrl, {
      method: "POST",
      headers: authorization,
      body,
    })).toBe(false);
  });

  it("rejects an opaque Request body because its token scope cannot be inspected synchronously", () => {
    const request = new Request(installationTokenUrl, {
      method: "POST",
      headers: authorization,
      body: leastPrivilegeBody,
    });

    expect(isTrustedCredentialEgressRequest(request)).toBe(false);
  });
});
