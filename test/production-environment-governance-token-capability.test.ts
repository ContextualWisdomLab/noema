import {
  chmodSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
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

  it("bootstraps the deployment audit through the token capability instead of GH_TOKEN", () => {
    const workflow = require("node:fs").readFileSync(".github/workflows/cd.yml", "utf8");
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
});
