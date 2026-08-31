import { describe, expect, it } from "vitest";
import { maintainerAppDelegatedGithubTokenPath } from "../scripts/maintainer-app-readiness.mjs";

describe("maintainer-app delegated GitHub capability path authority", () => {
  it("preserves configured capability-path bytes without trimming or normalization", () => {
    const configuredPath = " /tmp/noema-maintainer-token\t";

    expect(maintainerAppDelegatedGithubTokenPath({
      NOEMA_MAINTAINER_TOKEN_PATH: configuredPath,
    })).toBe(configuredPath);
  });

  it("preserves absent capability-path authority for the hardened reader to reject", () => {
    expect(maintainerAppDelegatedGithubTokenPath({})).toBeUndefined();
  });
});
