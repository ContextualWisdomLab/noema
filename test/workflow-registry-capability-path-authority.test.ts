import { describe, expect, it } from "vitest";
import { delegatedGithubTokenPath } from "../scripts/workflow-registry-live-audit.mjs";

describe("workflow-registry delegated GitHub capability path authority", () => {
  it("preserves configured capability-path bytes without trimming or normalization", () => {
    const configuredPath = " /tmp/noema-maintainer-token\t";

    expect(delegatedGithubTokenPath({
      NOEMA_MAINTAINER_TOKEN_PATH: configuredPath,
    })).toBe(configuredPath);
  });

  it("preserves absent capability-path authority for the hardened reader to reject", () => {
    expect(delegatedGithubTokenPath({})).toBeUndefined();
  });
});
