import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  bound,
  createGhSubprocessEnvironment,
  flattenGovernanceRulePages,
  flattenInstallationRepositoryPages,
  normalizeBotAccount,
  normalizeRepositoryPermissions,
  parseConfiguredIdentity,
  parseGithubApiJsonBytes,
  readDelegatedGithubToken,
  redactSensitiveValue,
  retainedRepositoryScope,
} from "../scripts/maintainer-app-readiness.mjs";

const directories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "noema-maintainer-helper-"));
  directories.push(directory);
  return directory;
}

afterAll(() => {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
});

describe("maintainer App helper production coverage", () => {
  it("bounds diagnostics after removing control characters and truncates deterministically", () => {
    expect(bound(undefined)).toBe("");
    expect(bound("  alpha\n beta\t ")).toBe("alpha beta");
    expect(bound("abcdef", 3)).toBe("abc…");
  });

  it("redacts only non-empty string capabilities", () => {
    expect(redactSensitiveValue("token=secret; keep=visible", ["", null, 42, "secret"]))
      .toBe("token=[REDACTED]; keep=visible");
    expect(redactSensitiveValue(undefined)).toBe("");
  });

  it("constructs a minimal GitHub CLI environment with optional capabilities only when present", () => {
    expect(createGhSubprocessEnvironment({})).toEqual({ GH_HOST: "github.com", NO_COLOR: "1" });
    expect(createGhSubprocessEnvironment({ PATH: "", GH_TOKEN: "" })).toEqual({
      GH_HOST: "github.com",
      NO_COLOR: "1",
    });
    expect(createGhSubprocessEnvironment({ PATH: "/usr/bin", GH_TOKEN: "delegated" })).toEqual({
      GH_HOST: "github.com",
      NO_COLOR: "1",
      PATH: "/usr/bin",
      GH_TOKEN: "delegated",
    });
  });

  it("rejects missing, hostile, and overlong configured identities without normalization ambiguity", () => {
    expect(parseConfiguredIdentity("  noema-maintainer  ", "slug")).toBe("noema-maintainer");
    expect(() => parseConfiguredIdentity(undefined, "slug")).toThrow(/slug is required/i);
    expect(() => parseConfiguredIdentity("bad\nslug", "slug")).toThrow(/control characters/i);
    expect(() => parseConfiguredIdentity("x".repeat(201), "slug")).toThrow(/at most 200/i);
  });

  it("enforces delegated token file capability boundaries", () => {
    const directory = temporaryDirectory();
    const validPath = join(directory, "valid-token");
    const emptyPath = join(directory, "empty-token");
    const controlPath = join(directory, "control-token");
    writeFileSync(validPath, "delegated-token", { encoding: "utf8", mode: 0o600 });
    writeFileSync(emptyPath, "", { encoding: "utf8", mode: 0o600 });
    writeFileSync(controlPath, "delegated-token\n", { encoding: "utf8", mode: 0o600 });

    expect(readDelegatedGithubToken(validPath)).toBe("delegated-token");
    expect(() => readDelegatedGithubToken("")).toThrow(/path is required/i);
    expect(() => readDelegatedGithubToken(join(directory, "missing"))).toThrow(/could not be read/i);
    expect(() => readDelegatedGithubToken(emptyPath)).toThrow(/must not be empty/i);
    expect(() => readDelegatedGithubToken(controlPath)).toThrow(/control characters/i);
  });

  it("parses only bounded-authority JSON bytes with fatal UTF-8 and unique decoded keys", () => {
    const encoder = new TextEncoder();
    expect(parseGithubApiJsonBytes(encoder.encode('{"ok":true}'), "GitHub API"))
      .toEqual({ ok: true });
    expect(() => parseGithubApiJsonBytes("not-bytes" as unknown as Uint8Array, "GitHub API"))
      .toThrow(/raw bytes/i);
    expect(() => parseGithubApiJsonBytes(new Uint8Array([0xc3, 0x28]), "GitHub API"))
      .toThrow(/invalid UTF-8/i);
    expect(() => parseGithubApiJsonBytes(encoder.encode("  \n\t"), "GitHub API"))
      .toThrow(/empty response/i);
    expect(() => parseGithubApiJsonBytes(encoder.encode('{"broken":'), "GitHub API"))
      .toThrow(/invalid JSON/i);
    expect(() => parseGithubApiJsonBytes(
      encoder.encode('{"a":1,"\\u0061":2}'),
      "GitHub API",
    )).toThrow(/duplicate decoded object keys/i);
  });

  it("validates installation repository pagination before flattening", () => {
    const first = { full_name: "ContextualWisdomLab/noema" };
    const second = { full_name: "ContextualWisdomLab/other" };
    expect(flattenInstallationRepositoryPages([
      { repositories: [first] },
      { repositories: [second] },
    ])).toEqual([first, second]);
    expect(() => flattenInstallationRepositoryPages({})).toThrow(/array of pages/i);
    expect(() => flattenInstallationRepositoryPages([null])).toThrow(/page must be an object/i);
    expect(() => flattenInstallationRepositoryPages([[first]])).toThrow(/page must be an object/i);
    expect(() => flattenInstallationRepositoryPages([{}])).toThrow(/repositories array/i);
  });

  it("validates active-governance pagination before flattening", () => {
    const first = { type: "pull_request" };
    const second = { type: "required_status_checks" };
    expect(flattenGovernanceRulePages([[first], [second]])).toEqual([first, second]);
    expect(() => flattenGovernanceRulePages({})).toThrow(/array of pages/i);
    expect(() => flattenGovernanceRulePages([{}])).toThrow(/page must be an array/i);
  });

  it("normalizes bot identity and permission evidence without manufacturing authority", () => {
    expect(normalizeBotAccount(null)).toEqual({ login: "", type: "" });
    expect(normalizeBotAccount([])).toEqual({ login: "", type: "" });
    expect(normalizeBotAccount({ login: " noema-maintainer[bot] ", type: "Bot" })).toEqual({
      login: "noema-maintainer[bot]",
      type: "Bot",
    });

    expect(normalizeRepositoryPermissions(null)).toEqual({
      pull: false,
      push: false,
      admin: null,
      maintain: false,
      triage: false,
    });
    expect(normalizeRepositoryPermissions([])).toEqual({
      pull: false,
      push: false,
      admin: null,
      maintain: false,
      triage: false,
    });
    expect(normalizeRepositoryPermissions({
      pull: true,
      push: true,
      admin: false,
      maintain: true,
      triage: true,
    })).toEqual({
      pull: true,
      push: true,
      admin: false,
      maintain: true,
      triage: true,
    });
    expect(normalizeRepositoryPermissions({ admin: true }).admin).toBe(true);
  });

  it("persists repository names only for an exact one-repository scope", () => {
    expect(retainedRepositoryScope(undefined)).toEqual({
      accessible_repository_count: 0,
      accessible_repositories: [],
    });
    expect(retainedRepositoryScope([null])).toEqual({
      accessible_repository_count: 1,
      accessible_repositories: [],
    });
    expect(retainedRepositoryScope([{ full_name: "ContextualWisdomLab/noema" }])).toEqual({
      accessible_repository_count: 1,
      accessible_repositories: ["ContextualWisdomLab/noema"],
    });
    expect(retainedRepositoryScope([
      { full_name: "ContextualWisdomLab/noema" },
      { full_name: "ContextualWisdomLab/other" },
    ])).toEqual({
      accessible_repository_count: 2,
      accessible_repositories: [],
    });
  });
});
