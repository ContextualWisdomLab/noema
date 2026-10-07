import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];
const expectedHeadSha = "a".repeat(40);
const initialBaseSha = "b".repeat(40);

interface PullRequestIdentity {
  readonly headSha: string;
  readonly baseRef: string;
  readonly baseSha: string;
}

function prepareIdentityGate(
  identities: readonly PullRequestIdentity[],
  options: { readonly isAncestor?: boolean } = {},
) {
  const directory = mkdtempSync(join(tmpdir(), "noema-live-pr-identity-"));
  temporaryDirectories.push(directory);
  const counterPath = join(directory, "gh-count");
  const environmentPath = join(directory, "github-env");
  const fakeGhPath = join(directory, "gh");
  const fakeGitPath = join(directory, "git");

  writeFileSync(
    fakeGhPath,
    `#!/usr/bin/env node
const fs = require("node:fs");
const identities = ${JSON.stringify(identities)};
const counterPath = ${JSON.stringify(counterPath)};
let count = 0;
try { count = Number(fs.readFileSync(counterPath, "utf8")); } catch {}
const identity = identities[Math.min(Math.floor(count / 2), identities.length - 1)];
const expected = count % 2 === 0
  ? [
      "api",
      "--method",
      "GET",
      "repos/ContextualWisdomLab/noema/pulls/733",
      "--jq",
      "[.head.sha,.base.ref] | @tsv",
    ]
  : [
      "api",
      "--method",
      "GET",
      "repos/ContextualWisdomLab/noema/git/ref/heads/" + identity.baseRef,
      "--jq",
      ".object.sha",
    ];
if (JSON.stringify(process.argv.slice(2)) !== JSON.stringify(expected)) {
  process.stderr.write("unexpected gh invocation: " + JSON.stringify(process.argv.slice(2)) + "\\n");
  process.exit(41);
}
fs.writeFileSync(counterPath, String(count + 1));
process.stdout.write(
  count % 2 === 0
    ? [identity.headSha, identity.baseRef].join("\\t") + "\\n"
    : identity.baseSha + "\\n",
);
`,
    { encoding: "utf8", mode: 0o700 },
  );
  writeFileSync(
    fakeGitPath,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === "check-ref-format" && args[1] === "--branch") {
  process.exit(args[2] && !args[2].includes("..") ? 0 : 1);
}
if (
  args[0] === "merge-base"
  && args[1] === "--is-ancestor"
  && args[2] === ${JSON.stringify(identities[0]?.baseSha)}
  && args[3] === ${JSON.stringify(expectedHeadSha)}
) {
  process.exit(${options.isAncestor === false ? 1 : 0});
}
process.stderr.write("unexpected git invocation: " + args.join(" "));
process.exit(2);
`,
    { encoding: "utf8", mode: 0o700 },
  );
  chmodSync(fakeGhPath, 0o700);
  chmodSync(fakeGitPath, 0o700);

  const baseEnvironment = {
    ...process.env,
    PATH: `${directory}:${process.env.PATH ?? ""}`,
    GITHUB_REPOSITORY: "ContextualWisdomLab/noema",
    GITHUB_ENV: environmentPath,
    NOEMA_PR_NUMBER: "733",
    NOEMA_EXPECTED_HEAD_SHA: expectedHeadSha,
  };
  const run = (mode: "capture" | "check", environment = baseEnvironment) =>
    spawnSync("bash", ["scripts/verify-live-pull-request-identity.sh", mode], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: environment,
    });

  return { baseEnvironment, environmentPath, run };
}

function exportedEnvironment(path: string): Record<string, string> {
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .trim()
      .split("\n")
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("CI live pull-request identity gate", () => {
  it("captures and rechecks one stable live head and base identity", () => {
    const identity = {
      headSha: expectedHeadSha,
      baseRef: "fix/prerequisite",
      baseSha: initialBaseSha,
    };
    const gate = prepareIdentityGate([identity, identity]);

    const capture = gate.run("capture");
    expect(capture.status, capture.stderr).toBe(0);
    const exported = exportedEnvironment(gate.environmentPath);
    expect(exported).toEqual({
      NOEMA_LIVE_PR_HEAD_SHA: expectedHeadSha,
      NOEMA_LIVE_PR_BASE_REF: "fix/prerequisite",
      NOEMA_LIVE_PR_BASE_SHA: initialBaseSha,
    });

    const check = gate.run("check", { ...gate.baseEnvironment, ...exported });
    expect(check.status, check.stderr).toBe(0);
  });

  it("rejects a base retarget even when the pull-request head is unchanged", () => {
    const gate = prepareIdentityGate([
      { headSha: expectedHeadSha, baseRef: "main", baseSha: initialBaseSha },
      { headSha: expectedHeadSha, baseRef: "fix/prerequisite", baseSha: "c".repeat(40) },
    ]);

    const capture = gate.run("capture");
    expect(capture.status, capture.stderr).toBe(0);
    const check = gate.run("check", {
      ...gate.baseEnvironment,
      ...exportedEnvironment(gate.environmentPath),
    });

    expect(check.status).not.toBe(0);
    expect(check.stderr).toContain("Pull-request identity changed during verification");
  });

  it("rejects a base-ref-only change", () => {
    const gate = prepareIdentityGate([
      { headSha: expectedHeadSha, baseRef: "main", baseSha: initialBaseSha },
      { headSha: expectedHeadSha, baseRef: "fix/prerequisite", baseSha: initialBaseSha },
    ]);

    expect(gate.run("capture").status).toBe(0);
    const check = gate.run("check", {
      ...gate.baseEnvironment,
      ...exportedEnvironment(gate.environmentPath),
    });

    expect(check.status).not.toBe(0);
    expect(check.stderr).toContain("Pull-request identity changed during verification");
  });

  it("resolves the base branch tip independently of stale pull-request metadata", () => {
    const gate = prepareIdentityGate([
      { headSha: expectedHeadSha, baseRef: "main", baseSha: initialBaseSha },
      { headSha: expectedHeadSha, baseRef: "main", baseSha: "c".repeat(40) },
    ]);

    expect(gate.run("capture").status).toBe(0);
    const check = gate.run("check", {
      ...gate.baseEnvironment,
      ...exportedEnvironment(gate.environmentPath),
    });

    expect(check.status).not.toBe(0);
    expect(check.stderr).toContain("Pull-request identity changed during verification");
  });

  it("rejects a head change even when the base identity is unchanged", () => {
    const gate = prepareIdentityGate([
      { headSha: expectedHeadSha, baseRef: "main", baseSha: initialBaseSha },
      { headSha: "d".repeat(40), baseRef: "main", baseSha: initialBaseSha },
    ]);

    const capture = gate.run("capture");
    expect(capture.status, capture.stderr).toBe(0);
    const check = gate.run("check", {
      ...gate.baseEnvironment,
      ...exportedEnvironment(gate.environmentPath),
    });

    expect(check.status).not.toBe(0);
    expect(check.stderr).toContain("Pull-request identity changed during verification");
  });

  it("fails closed on malformed live identity fields", () => {
    const gate = prepareIdentityGate([
      { headSha: "not-a-sha", baseRef: "main", baseSha: initialBaseSha },
    ]);

    const capture = gate.run("capture");

    expect(capture.status).not.toBe(0);
    expect(capture.stderr).toContain("Live pull-request head is invalid");
  });

  it("fails closed when the exact live base is not an ancestor of the reviewed head", () => {
    const gate = prepareIdentityGate([
      {
        headSha: expectedHeadSha,
        baseRef: "fix/prerequisite",
        baseSha: initialBaseSha,
      },
    ], { isAncestor: false });

    const capture = gate.run("capture");

    expect(capture.status).not.toBe(0);
    expect(capture.stderr).toContain("does not contain the live base");
  });

  it("binds both workflow gates to the live PR API rather than event base fields", () => {
    const workflow = readFileSync(".github/workflows/ci.yml", "utf8");

    expect(workflow).toContain("types: [opened, synchronize, reopened, edited]");
    expect(workflow).toMatch(/permissions:\n\s+contents: read\n\s+pull-requests: read/);
    expect(workflow).toContain(
      "NOEMA_PR_NUMBER: ${{ github.event.pull_request.number }}",
    );
    expect(workflow).toContain(
      "bash scripts/verify-live-pull-request-identity.sh capture",
    );
    expect(workflow).toContain(
      "bash scripts/verify-live-pull-request-identity.sh check",
    );
    expect(workflow).not.toContain(
      "NOEMA_PR_BASE_REF: ${{ github.event.pull_request.base.ref }}",
    );
    const gate = readFileSync("scripts/verify-live-pull-request-identity.sh", "utf8");
    expect(gate).toContain("--jq '[.head.sha,.base.ref] | @tsv'");
    expect(gate).toContain(
      'gh api --method GET "repos/${GITHUB_REPOSITORY}/git/ref/heads/${base_ref}"',
    );
    expect(gate).toContain("--jq '.object.sha'");
    expect(gate).not.toContain(".base.sha");
  });
});
