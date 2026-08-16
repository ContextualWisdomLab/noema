import { afterEach, describe, expect, it } from "vitest";
import { main } from "../scripts/workflow-registry-live-disable.mjs";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_ARGV = [...process.argv];

function restoreProcessState() {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
  process.argv = [...ORIGINAL_ARGV];
}

afterEach(() => {
  restoreProcessState();
});

describe("workflow registry live-disable credential materialization order", () => {
  it("rejects a missing workflow identity before reading a delegated credential file", async () => {
    process.env.GITHUB_REPOSITORY = "ContextualWisdomLab/noema";
    delete process.env.NOEMA_MAINTAINER_TOKEN_PATH;
    process.argv = ["node", "workflow-registry-live-disable.mjs"];

    await expect(main()).rejects.toThrow(
      "requested workflow id must be a positive safe integer",
    );
  });

  it("rejects a repository substitution before reading a delegated credential file", async () => {
    process.env.GITHUB_REPOSITORY = "ContextualWisdomLab/other";
    delete process.env.NOEMA_MAINTAINER_TOKEN_PATH;
    process.argv = ["node", "workflow-registry-live-disable.mjs", "101"];

    await expect(main()).rejects.toThrow(
      "workflow disablement is restricted to ContextualWisdomLab/noema",
    );
  });
});
