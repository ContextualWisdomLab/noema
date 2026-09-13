import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  parseProtectedMainLsRemote,
  verifyReleaseProtectedSource,
} from "../scripts/release-protected-source.mjs";

const CURRENT_MAIN = "1111111111111111111111111111111111111111";
const OTHER_COMMIT = "2222222222222222222222222222222222222222";

function releaseEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    GITHUB_ACTIONS: "true",
    GITHUB_REPOSITORY: "ContextualWisdomLab/noema",
    GITHUB_REF: "refs/tags/v0.1.0",
    GITHUB_SHA: CURRENT_MAIN,
    ...overrides,
  };
}

describe("release protected-main authority", () => {
  it("wires the protected-source gate ahead of the release verification suite", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts["release:protected-source"]).toBe(
      "node scripts/release-protected-source.mjs",
    );
    expect(packageJson.scripts["release:verify"]).toMatch(
      /^npm run release:protected-source && /,
    );
    expect(packageJson.scripts["release:verify:strict"]).toMatch(
      /^npm run release:protected-source && /,
    );
  });

  it("admits only the exact current protected main in a tag-triggered Actions release", () => {
    const resolveProtectedMainSha = vi.fn(() => CURRENT_MAIN);

    expect(
      verifyReleaseProtectedSource({
        env: releaseEnv(),
        resolveProtectedMainSha,
      }),
    ).toEqual({
      status: "PASS",
      repository: "ContextualWisdomLab/noema",
      releaseCommitSha: CURRENT_MAIN,
      protectedMainSha: CURRENT_MAIN,
    });
    expect(resolveProtectedMainSha).toHaveBeenCalledTimes(1);
  });

  it("rejects a release tag that points outside the exact current protected main", () => {
    expect(() =>
      verifyReleaseProtectedSource({
        env: releaseEnv({ GITHUB_SHA: OTHER_COMMIT }),
        resolveProtectedMainSha: () => CURRENT_MAIN,
      }),
    ).toThrow(/release commit .* does not equal current protected main/i);
  });

  it("honors an explicit release commit identity but does not let it bypass protected main", () => {
    expect(() =>
      verifyReleaseProtectedSource({
        env: releaseEnv({
          GITHUB_SHA: CURRENT_MAIN,
          NOEMA_RELEASE_COMMIT_SHA: OTHER_COMMIT,
        }),
        resolveProtectedMainSha: () => CURRENT_MAIN,
      }),
    ).toThrow(/release commit .* does not equal current protected main/i);
  });

  it("skips non-tag and non-Actions verification contexts without resolving main", () => {
    const resolveProtectedMainSha = vi.fn(() => CURRENT_MAIN);

    expect(
      verifyReleaseProtectedSource({
        env: releaseEnv({ GITHUB_REF: "refs/pull/710/merge" }),
        resolveProtectedMainSha,
      }),
    ).toEqual({ status: "SKIPPED", reason: "not_release_tag_actions_context" });
    expect(
      verifyReleaseProtectedSource({
        env: releaseEnv({ GITHUB_ACTIONS: "false" }),
        resolveProtectedMainSha,
      }),
    ).toEqual({ status: "SKIPPED", reason: "not_release_tag_actions_context" });
    expect(resolveProtectedMainSha).not.toHaveBeenCalled();
  });

  it("fails closed on repository or release identity substitution", () => {
    expect(() =>
      verifyReleaseProtectedSource({
        env: releaseEnv({ GITHUB_REPOSITORY: "attacker/noema" }),
        resolveProtectedMainSha: () => CURRENT_MAIN,
      }),
    ).toThrow(/release repository/i);
    expect(() =>
      verifyReleaseProtectedSource({
        env: releaseEnv({ GITHUB_SHA: "not-a-sha" }),
        resolveProtectedMainSha: () => CURRENT_MAIN,
      }),
    ).toThrow(/release commit sha/i);
    expect(() =>
      verifyReleaseProtectedSource({
        env: releaseEnv(),
        resolveProtectedMainSha: () => "ABCDEF",
      }),
    ).toThrow(/protected main sha/i);
  });

  it("parses exactly one canonical ls-remote main record and rejects ambiguity", () => {
    expect(
      parseProtectedMainLsRemote(`${CURRENT_MAIN}\trefs/heads/main\n`),
    ).toBe(CURRENT_MAIN);

    for (const hostile of [
      "",
      `${CURRENT_MAIN}\trefs/heads/develop\n`,
      `${CURRENT_MAIN}\trefs/heads/main\n${OTHER_COMMIT}\trefs/heads/main\n`,
      `${CURRENT_MAIN.toUpperCase()}\trefs/heads/main\n`,
      `${CURRENT_MAIN}\trefs/heads/main\textra\n`,
    ]) {
      expect(() => parseProtectedMainLsRemote(hostile)).toThrow();
    }
  });
});
