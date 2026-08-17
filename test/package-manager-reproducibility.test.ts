import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  packageManager?: string;
  allowScripts?: Record<string, boolean>;
  devEngines?: {
    runtime?: { name?: string; version?: string; onFail?: string };
    packageManager?: { name?: string; version?: string; onFail?: string };
  };
};
const ciWorkflow = readFileSync(".github/workflows/ci.yml", "utf8");
const npmConfig = readFileSync(".npmrc", "utf8");

/**
 * Run npm inside a disposable fixture without inheriting user-level npm policy.
 *
 * @param cwd Fixture directory that owns the project-scoped `.npmrc`.
 * @param args npm command arguments.
 * @param extraEnv Additional environment variables needed by the fixture.
 * @returns The synchronous child-process result with UTF-8 output.
 */
function runFixtureNpm(
  cwd: string,
  args: string[],
  extraEnv: Record<string, string> = {},
) {
  const userConfig = join(cwd, "empty-user-npmrc");
  writeFileSync(userConfig, "", "utf8");
  return spawnSync("npm", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      NPM_CONFIG_CACHE: join(cwd, ".npm-cache"),
      NPM_CONFIG_USERCONFIG: userConfig,
      ...extraEnv,
    },
  });
}

describe("package-manager reproducibility contract", () => {
  it("pins the reviewed Node and npm identities in repository metadata", () => {
    expect(packageJson.packageManager).toBe("npm@11.17.0");
    expect(packageJson.devEngines?.runtime).toEqual({
      name: "node",
      version: "24.19.0",
      onFail: "error",
    });
    expect(packageJson.devEngines?.packageManager).toEqual({
      name: "npm",
      version: "11.17.0",
      onFail: "error",
    });
  });

  it("fails closed on unreviewed dependency install scripts and pins reviewed script identities", () => {
    expect(npmConfig.split(/\r?\n/).filter(Boolean)).toContain("strict-allow-scripts=true");
    expect(packageJson.allowScripts).toEqual({
      "esbuild@0.28.1": true,
      "fsevents@2.3.3": false,
      "workerd@1.20260625.1": true,
    });
  });

  it("proves an unreviewed local dependency script cannot execute under the pinned strict policy", () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), "noema-allow-scripts-"));
    const dependencyRoot = join(fixtureRoot, "dependency");
    const markerPath = join(fixtureRoot, "unexpected-install-script-marker");

    try {
      mkdirSync(dependencyRoot);
      writeFileSync(
        join(dependencyRoot, "package.json"),
        JSON.stringify({
          name: "noema-unreviewed-script-fixture",
          version: "1.0.0",
          scripts: {
            postinstall:
              "node -e \"require('node:fs').writeFileSync(process.env.NOEMA_INSTALL_SCRIPT_MARKER, 'executed')\"",
          },
        }),
        "utf8",
      );
      writeFileSync(
        join(fixtureRoot, "package.json"),
        JSON.stringify({
          name: "noema-strict-install-script-policy-fixture",
          version: "1.0.0",
          private: true,
          dependencies: {
            "noema-unreviewed-script-fixture": "file:./dependency",
          },
        }),
        "utf8",
      );
      writeFileSync(join(fixtureRoot, ".npmrc"), "strict-allow-scripts=true\n", "utf8");

      const lock = runFixtureNpm(fixtureRoot, [
        "install",
        "--package-lock-only",
        "--ignore-scripts",
        "--offline",
        "--no-audit",
        "--no-fund",
      ]);
      expect(lock.status, `${lock.stdout}\n${lock.stderr}`).toBe(0);

      const install = runFixtureNpm(
        fixtureRoot,
        ["ci", "--offline", "--no-audit", "--no-fund"],
        { NOEMA_INSTALL_SCRIPT_MARKER: markerPath },
      );
      const output = `${install.stdout}\n${install.stderr}`;

      expect(install.status).not.toBe(0);
      expect(output).toMatch(/allowScripts|strict-allow-scripts|ESTRICTALLOWSCRIPTS/i);
      expect(existsSync(markerPath)).toBe(false);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("pins CI to Node-24-native checkout and setup-node action releases", () => {
    expect(ciWorkflow).toContain(
      "actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2",
    );
    expect(ciWorkflow).toContain(
      "actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6.4.0",
    );
    expect(ciWorkflow).not.toContain("actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683");
    expect(ciWorkflow).not.toContain("actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020");
  });

  it("pins CI to the same Node distribution and verifies toolchain identity before install", () => {
    expect(ciWorkflow).toContain('node-version: "24.19.0"');
    const toolchainGate = ciWorkflow.indexOf("name: verify package-manager toolchain");
    const install = ciWorkflow.indexOf("name: install");
    expect(toolchainGate).toBeGreaterThan(-1);
    expect(install).toBeGreaterThan(toolchainGate);
    expect(ciWorkflow).toContain('test "$(node --version)" = "v24.19.0"');
    expect(ciWorkflow).toContain('test "$(npm --version)" = "11.17.0"');
  });

  it("checks out and verifies the exact pull-request head instead of GitHub's synthetic merge ref", () => {
    const checkout = ciWorkflow.indexOf("name: checkout");
    const setupNode = ciWorkflow.indexOf("name: setup node");
    expect(checkout).toBeGreaterThan(-1);
    expect(setupNode).toBeGreaterThan(checkout);
    expect(ciWorkflow).toContain(
      "ref: ${{ github.event_name == 'pull_request' && github.event.pull_request.head.sha || github.sha }}",
    );
    expect(ciWorkflow).toContain("name: verify exact checkout");
    expect(ciWorkflow).toContain("NOEMA_EXPECTED_HEAD_SHA: ${{ github.event.pull_request.head.sha || github.sha }}");
    expect(ciWorkflow).toContain('test "$(git rev-parse HEAD)" = "$NOEMA_EXPECTED_HEAD_SHA"');
  });

  it("validates the fresh live pull-request base as exactly forty lowercase hexadecimal characters", () => {
    const shaGate = ciWorkflow.indexOf('if [[ ! "$live_base_sha" =~ ^[0-9a-f]{40}$ ]]; then');
    const exportLiveBase = ciWorkflow.indexOf(
      "printf 'NOEMA_LIVE_BASE_SHA=%s\\n' \"$live_base_sha\" >> \"$GITHUB_ENV\"",
    );
    const lockfileGuard = ciWorkflow.indexOf(
      'if [[ ! "$NOEMA_LIVE_BASE_SHA" =~ ^[0-9a-f]{40}$ ]]; then',
    );
    const baseRead = ciWorkflow.indexOf(
      'git show "${NOEMA_LIVE_BASE_SHA}:package-lock.json"',
    );

    expect(shaGate).toBeGreaterThan(-1);
    expect(exportLiveBase).toBeGreaterThan(shaGate);
    expect(lockfileGuard).toBeGreaterThan(exportLiveBase);
    expect(baseRead).toBeGreaterThan(lockfileGuard);
    expect(ciWorkflow).toContain("printf '::error::Live pull-request base ref did not resolve to a full commit SHA.\\n'");
    expect(ciWorkflow).toContain("printf '::error::Invalid live pull-request base SHA.\\n'");
    expect(ciWorkflow).not.toContain(
      "[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]",
    );
  });

  it("binds lockfile validation to one fresh live base and refuses base movement during verification", () => {
    const beforeGate = ciWorkflow.indexOf("name: verify live pull-request base before lockfile control");
    const lockfileGate = ciWorkflow.indexOf("name: verify lockfile change control");
    const releaseVerify = ciWorkflow.indexOf("name: release verify");
    const afterGate = ciWorkflow.indexOf("name: refuse pull-request base drift after verification");

    expect(beforeGate).toBeGreaterThan(-1);
    expect(lockfileGate).toBeGreaterThan(beforeGate);
    expect(releaseVerify).toBeGreaterThan(lockfileGate);
    expect(afterGate).toBeGreaterThan(releaseVerify);
    expect(ciWorkflow).toContain("NOEMA_PR_BASE_REF: ${{ github.event.pull_request.base.ref }}");
    expect(ciWorkflow).toContain(
      'git merge-base --is-ancestor "$live_base_sha" "$NOEMA_EXPECTED_HEAD_SHA"',
    );
    expect(ciWorkflow).toContain(
      'printf \'NOEMA_LIVE_BASE_SHA=%s\\n\' "$live_base_sha" >> "$GITHUB_ENV"',
    );
    expect(ciWorkflow.match(/gh api graphql/g)?.length).toBeGreaterThanOrEqual(2);
    expect(ciWorkflow.match(/ref\(qualifiedName:\$qualifiedName\)\{target\{oid\}\}/g)?.length).toBeGreaterThanOrEqual(2);
    expect(ciWorkflow).toContain('if [ "$live_base_sha" != "$NOEMA_LIVE_BASE_SHA" ]; then');
    expect(ciWorkflow).toContain('test "$live_base_sha" = "$NOEMA_LIVE_BASE_SHA"');
    expect(ciWorkflow).not.toContain(
      "NOEMA_PR_BASE_SHA: ${{ github.event.pull_request.base.sha }}",
    );
  });
});
