import { describe, expect, it } from "vitest";
import { isTrustedCredentialEgressRequest } from "../src/outbound-fetch-policy";

const installationLookup = "https://api.github.com/repos/ContextualWisdomLab/noema/installation";
const installationToken = "https://api.github.com/app/installations/123/access_tokens";

describe("credential-egress HTTP method canonicality", () => {
  it.each(["get", "Get", "gEt"])(
    "rejects non-canonical repository-installation method bytes before credential egress: %s",
    (method) => {
      expect(isTrustedCredentialEgressRequest(installationLookup, {
        method,
        headers: { authorization: "Bearer canonical-token" },
      })).toBe(false);
    },
  );

  it.each(["post", "Post", "pOsT"])(
    "rejects non-canonical installation-token method bytes before credential egress: %s",
    (method) => {
      expect(isTrustedCredentialEgressRequest(installationToken, {
        method,
        headers: {
          authorization: "Bearer canonical-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          permissions: { checks: "read", contents: "read", pull_requests: "write" },
          repositories: ["noema"],
        }),
      })).toBe(false);
    },
  );
});
