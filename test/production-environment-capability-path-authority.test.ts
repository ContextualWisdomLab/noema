import { describe, expect, it } from "vitest";
import { productionEnvironmentDelegatedGithubTokenPath } from "../scripts/production-environment-governance-audit.mjs";

describe("production-environment delegated GitHub capability path authority", () => {
  it("preserves configured capability-path bytes without trimming or normalization", () => {
    const configuredPath = " /tmp/noema-maintainer-token\t";

    expect(productionEnvironmentDelegatedGithubTokenPath({
      NOEMA_MAINTAINER_TOKEN_PATH: configuredPath,
    })).toBe(configuredPath);
  });

  it("preserves absent capability-path authority for the hardened reader to reject", () => {
    expect(productionEnvironmentDelegatedGithubTokenPath({})).toBeUndefined();
  });
});
