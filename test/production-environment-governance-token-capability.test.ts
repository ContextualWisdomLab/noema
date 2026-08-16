import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  main,
  readDelegatedGithubToken,
} from "../scripts/production-environment-governance-audit.mjs";

const temporaryDirectories: string[] = [];

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "noema-production-governance-token-"));
  temporaryDirectories.push(directory);
  return directory;
}

function tokenFile(mode = 0o600) {
  const directory = temporaryDirectory();
  const path = join(directory, "maintainer-app-token");
  writeFileSync(path, "short-lived-maintainer-token", { encoding: "utf8", mode });
  chmodSync(path, mode);
  return path;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("production environment governance GitHub credential ingress", () => {
  it("reads only an owner-only delegated capability file", () => {
    expect(readDelegatedGithubToken(tokenFile())).toBe("short-lived-maintainer-token");

    expect(() => readDelegatedGithubToken(tokenFile(0o640))).toThrow(
      "Maintainer token file permissions must be owner-only.",
    );
  });

  it("refuses a symlinked delegated token capability", () => {
    const directory = temporaryDirectory();
    const target = join(directory, "real-token");
    const link = join(directory, "token-link");
    writeFileSync(target, "short-lived-maintainer-token", { encoding: "utf8", mode: 0o600 });
    symlinkSync(target, link);

    expect(() => readDelegatedGithubToken(link)).toThrow(
      "Maintainer token file could not be opened safely:",
    );
  });

  it("fails closed instead of falling back to an ambient GH_TOKEN", () => {
    const directory = temporaryDirectory();
    const report = main({
      sourceEnvironment: {
        GITHUB_REPOSITORY: "ContextualWisdomLab/noema",
        GH_TOKEN: "ambient-token-must-not-be-used",
        NOEMA_PRODUCTION_ENVIRONMENT_GOVERNANCE_PATH: join(directory, "report.json"),
      },
      log: () => undefined,
      setExitCode: () => undefined,
    });

    expect(report).toMatchObject({ status: "FAIL" });
    expect(report.failures[0]).toMatchObject({
      code: "production_environment_collection_failed",
      detail: "Maintainer token file path is required.",
    });
    expect(readFileSync(join(directory, "report.json"), "utf8")).not.toContain(
      "ambient-token-must-not-be-used",
    );
  });

  it("bootstraps the deployment audit through the token capability instead of GH_TOKEN", () => {
    const workflow = readFileSync(".github/workflows/cd.yml", "utf8");
    const auditStart = workflow.indexOf("- name: Audit production environment deployment protections");
    const auditEnd = workflow.indexOf("- name: Production evidence preflight", auditStart);
    const auditStep = workflow.slice(auditStart, auditEnd);

    expect(auditStart).toBeGreaterThan(-1);
    expect(auditEnd).toBeGreaterThan(auditStart);
    expect(auditStep).toContain("NOEMA_MAINTAINER_TOKEN_PATH");
    expect(auditStep).toContain("umask 077");
    expect(auditStep).toContain("chmod 0600");
    expect(auditStep).not.toContain("GH_TOKEN: ${{ github.token }}");
  });

  it("creates a fresh private directory before writing delegated token bytes", () => {
    const workflow = readFileSync(".github/workflows/cd.yml", "utf8");
    const auditStart = workflow.indexOf("- name: Audit production environment deployment protections");
    const auditEnd = workflow.indexOf("- name: Production evidence preflight", auditStart);
    const auditStep = workflow.slice(auditStart, auditEnd);
    const umaskIndex = auditStep.indexOf("umask 077");
    const mktempIndex = auditStep.indexOf(
      'token_dir="$(mktemp -d "$RUNNER_TEMP/noema-production-governance.XXXXXX")"',
    );

    expect(auditStart).toBeGreaterThan(-1);
    expect(auditEnd).toBeGreaterThan(auditStart);
    expect(umaskIndex).toBeGreaterThan(-1);
    expect(mktempIndex).toBeGreaterThan(umaskIndex);
    expect(auditStep).not.toContain('token_dir="$RUNNER_TEMP/noema-production-governance"');
    expect(auditStep).not.toContain('mkdir -p "$token_dir"');
    expect(auditStep).toContain("trap 'rm -rf \"$token_dir\"' EXIT");
  });
});
