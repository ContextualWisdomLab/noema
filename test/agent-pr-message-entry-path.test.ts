import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { resolveAgentPrMessageInvocationUrl } from "../scripts/prepare-agent-pr-message.mjs";

describe("agent PR-message entry-path resolution", () => {
  it("returns an empty URL when Node has no script argument", () => {
    expect(resolveAgentPrMessageInvocationUrl(undefined)).toBe("");
  });

  it("resolves the script argument to the same canonical file URL used by the entrypoint", () => {
    const entryPath = "scripts/prepare-agent-pr-message.mjs";

    expect(resolveAgentPrMessageInvocationUrl(entryPath)).toBe(
      pathToFileURL(resolve(entryPath)).href,
    );
  });
});
