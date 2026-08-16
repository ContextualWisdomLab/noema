import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { REQUIRED_MAIN_CHECK_NAMES } from "../scripts/lib/main-governance-audit.mjs";

const repository = "ContextualWisdomLab/noema";
const originalEnvironment = { ...process.env };
const originalArgv1 = process.argv[1];
const originalExitCode = process.exitCode;
const directories: string[] = [];
let subject: typeof import("../scripts/maintainer-app-readiness.mjs");
let directFixture: ReturnType<typeof createFixture>;

function compliantGovernanceRules() {
  return [
    {
      type: "pull_request",
      ruleset_id: 101,
      ruleset_source_type: "Repository",
      ruleset_source: repository,
      parameters: {
        allowed_merge_methods: ["squash"],
        dismiss_stale_reviews_on_push: true,
        require_code_owner_review: false,
        require_last_push_approval: false,
        required_approving_review_count: 1,
        required_review_thread_resolution: true,
      },
    },
    {
      type: "required_status_checks",
      ruleset_id: 101,
      ruleset_source_type: "Repository",
      ruleset_source: repository,
      parameters: {
        do_not_enforce_on_create: false,
        strict_required_status_checks_policy: true,
        required_status_checks: REQUIRED_MAIN_CHECK_NAMES.map((context, index) => ({
          context,
          integration_id: 15_368 + index,
        })),
      },
    },
    {
      type: "non_fast_forward",
      ruleset_id: 101,
      ruleset_source_type: "Repository",
      ruleset_source: repository,
    },
    {
      type: "deletion",
      ruleset_id: 101,
      ruleset_source_type: "Repository",
      ruleset_source: repository,
    },
  ];
}

function fakeGhSource() {
  const rulesPage = JSON.stringify([compliantGovernanceRules()]);
  return `#!/usr/bin/env node
const endpoint = process.argv.at(-1) || "";
const token = process.env.GH_TOKEN || "";
const fail = (stream, detail) => {
  if (stream === "stderr") process.stderr.write(detail);
  if (stream === "stdout") process.stdout.write(detail);
  process.exit(2);
};
if (token === "gh-status-token" && endpoint.includes("installation/repositories")) {
  fail("stderr", "request gh-status-token failed");
}
if (token === "gh-stdout-token" && endpoint.includes("installation/repositories")) {
  fail("stdout", "request gh-stdout-token failed");
}
if (token === "gh-empty-token" && endpoint.includes("installation/repositories")) {
  process.exit(2);
}
if (token === "json-error-token" && endpoint.includes("installation/repositories")) {
  process.stdout.write('{"broken":');
  process.exit(0);
}
if (token === "probe-fail-token" && endpoint.includes("actions/runs")) {
  process.stderr.write("synthetic probe failure");
  process.exit(1);
}
let payload = {};
if (endpoint.includes("installation/repositories")) {
  payload = [{ repositories: [{ full_name: "${repository}" }] }];
} else if (endpoint.includes("users/noema-maintainer")) {
  payload = { login: "noema-maintainer[bot]", type: "Bot" };
} else if (endpoint.includes("users/noema-reviewer")) {
  payload = { login: "noema-reviewer[bot]", type: "Bot" };
} else if (endpoint === "repos/${repository}") {
  payload = {
    default_branch: token === "bad-default-token" ? "release" : "main",
    permissions: { pull: true, push: true, admin: false, maintain: false, triage: false },
  };
} else if (endpoint.includes("/commits/main")) {
  payload = { sha: token === "bad-sha-token" ? "short" : "a".repeat(40) };
} else if (endpoint.includes("/rules/branches/main")) {
  process.stdout.write(${JSON.stringify(rulesPage)});
  process.exit(0);
}
process.stdout.write(JSON.stringify(payload));
`;
}

function createFixture(token = "success-token") {
  const directory = mkdtempSync(join(tmpdir(), "noema-maintainer-production-"));
  directories.push(directory);
  const binDirectory = join(directory, "bin");
  const ghPath = join(binDirectory, "gh");
  const tokenPath = join(directory, "token");
  const governancePath = join(directory, "governance.json");
  const reportPath = join(directory, "report.json");
  const outputPath = join(directory, "output.txt");
  const summaryPath = join(directory, "summary.md");

  mkdirSync(binDirectory, { recursive: true });
  writeFileSync(tokenPath, token, { encoding: "utf8", mode: 0o600 });
  writeFileSync(
    governancePath,
    `${JSON.stringify({ repository, branch: "main", status: "PASS" })}\n`,
    "utf8",
  );
  writeFileSync(ghPath, fakeGhSource(), "utf8");
  chmodSync(ghPath, 0o755);
  return {
    directory,
    binDirectory,
    tokenPath,
    governancePath,
    reportPath,
    outputPath,
    summaryPath,
  };
}

function configure(fixture: ReturnType<typeof createFixture>, overrides: NodeJS.ProcessEnv = {}) {
  Object.assign(process.env, {
    GITHUB_REPOSITORY: repository,
    NOEMA_MAINTAINER_TOKEN_PATH: fixture.tokenPath,
    NOEMA_MAINTAINER_APP_SLUG: "noema-maintainer",
    NOEMA_MAINTAINER_INSTALLATION_ID: "123456",
    NOEMA_REVIEWER_APP_SLUG: "noema-reviewer",
    NOEMA_REVIEWER_INSTALLATION_ID: "654321",
    NOEMA_REVIEWER_LOGIN: "noema-reviewer[bot]",
    NOEMA_MAINTENANCE_ENABLED: "false",
    NOEMA_MAINTAINER_READINESS_PATH: fixture.reportPath,
    NOEMA_GOVERNANCE_AUDIT_PATH: fixture.governancePath,
    GITHUB_OUTPUT: fixture.outputPath,
    GITHUB_STEP_SUMMARY: fixture.summaryPath,
    PATH: `${fixture.binDirectory}:${originalEnvironment.PATH || ""}`,
    ...overrides,
  });
}

function restoreProcessState() {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnvironment)) delete process.env[key];
  }
  Object.assign(process.env, originalEnvironment);
  process.argv[1] = originalArgv1;
  process.exitCode = originalExitCode;
}

function runMain(fixture: ReturnType<typeof createFixture>, overrides: NodeJS.ProcessEnv = {}) {
  configure(fixture, overrides);
  const previousExitCode = process.exitCode;
  try {
    return subject.main();
  } finally {
    process.exitCode = previousExitCode;
  }
}

beforeAll(async () => {
  directFixture = createFixture();
  configure(directFixture);
  process.argv[1] = resolve("scripts/maintainer-app-readiness.mjs");
  subject = await import("../scripts/maintainer-app-readiness.mjs");
  process.argv[1] = originalArgv1;
});

afterAll(() => {
  restoreProcessState();
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
});

describe("maintainer App production collector coverage", () => {
  it("executes the direct production entry point through a shell-free fake GitHub API", () => {
    const report = JSON.parse(readFileSync(directFixture.reportPath, "utf8"));
    expect(report.status).toBe("PASS");
    expect(report.default_branch_head_sha).toBe("a".repeat(40));
    expect(readFileSync(directFixture.outputPath, "utf8")).toContain(
      "maintainer_app_readiness_status=PASS",
    );
    expect(readFileSync(directFixture.summaryPath, "utf8")).toContain("Status: **PASS**");
  });

  it("records a failed API probe while retaining the remaining live evidence", () => {
    const fixture = createFixture("probe-fail-token");
    const report = runMain(fixture);

    expect(report.status).toBe("FAIL");
    expect(report.api_probes.actions_read).toBe(false);
    expect(report.failures.some((failure: { code: string }) => failure.code === "api_probe_actions_read"))
      .toBe(true);
    expect(readFileSync(fixture.summaryPath, "utf8")).toContain("### Failures");
  });

  it("fails closed on a non-main default branch", () => {
    const report = runMain(createFixture("bad-default-token"));
    expect(report.status).toBe("FAIL");
    expect(report.failures[0].code).toBe("collection_failed");
    expect(report.failures[0].detail).toMatch(/default branch must be main/i);
  });

  it("fails closed when the default-branch lookup does not return a full SHA", () => {
    const report = runMain(createFixture("bad-sha-token"));
    expect(report.status).toBe("FAIL");
    expect(report.failures[0].detail).toMatch(/full SHA/i);
  });

  it("fails closed and redacts delegated authority from GitHub CLI stderr", () => {
    const report = runMain(createFixture("gh-status-token"));
    expect(report.status).toBe("FAIL");
    expect(report.failures[0].detail).toContain("[REDACTED]");
    expect(report.failures[0].detail).not.toContain("gh-status-token");
  });

  it("uses bounded stdout diagnostics when GitHub CLI fails without stderr", () => {
    const report = runMain(createFixture("gh-stdout-token"));
    expect(report.status).toBe("FAIL");
    expect(report.failures[0].detail).toContain("[REDACTED]");
    expect(report.failures[0].detail).not.toContain("gh-stdout-token");
  });

  it("uses the exit status when GitHub CLI fails without output", () => {
    const report = runMain(createFixture("gh-empty-token"));
    expect(report.status).toBe("FAIL");
    expect(report.failures[0].detail).toMatch(/exit 2/i);
  });

  it("reports a spawn failure without ambient credentials", () => {
    const fixture = createFixture();
    const emptyPath = join(fixture.directory, "empty-path");
    mkdirSync(emptyPath);
    const report = runMain(fixture, { PATH: emptyPath });

    expect(report.status).toBe("FAIL");
    expect(report.failures[0].detail).toMatch(/could not complete/i);
  });

  it("rejects malformed successful GitHub API JSON", () => {
    const report = runMain(createFixture("json-error-token"));
    expect(report.status).toBe("FAIL");
    expect(report.failures[0].detail).toMatch(/invalid JSON/i);
  });

  it("reports unreadable and malformed retained governance evidence", () => {
    const unreadable = createFixture();
    const unreadableReport = runMain(unreadable, {
      NOEMA_GOVERNANCE_AUDIT_PATH: join(unreadable.directory, "missing.json"),
    });
    expect(unreadableReport.failures[0].detail).toMatch(/could not be read/i);

    const malformed = createFixture();
    writeFileSync(malformed.governancePath, "{", "utf8");
    const malformedReport = runMain(malformed);
    expect(malformedReport.failures[0].detail).toMatch(/invalid JSON/i);
  });

  it("fails before collection for invalid configuration and can omit workflow output sinks", () => {
    const fixture = createFixture();
    configure(fixture, { GITHUB_REPOSITORY: "" });
    delete process.env.GITHUB_OUTPUT;
    delete process.env.GITHUB_STEP_SUMMARY;
    const previousExitCode = process.exitCode;
    let report;
    try {
      report = subject.main();
    } finally {
      process.exitCode = previousExitCode;
    }

    expect(report.status).toBe("FAIL");
    expect(report.repository).toBe("unknown");
  });

  it("rejects invalid numeric installation configuration before GitHub collection", () => {
    const report = runMain(createFixture(), { NOEMA_MAINTAINER_INSTALLATION_ID: "not-an-integer" });
    expect(report.status).toBe("FAIL");
    expect(report.failures[0].detail).toMatch(/positive integer/i);
  });

  it("retains missing governance status as missing rather than manufacturing PASS", () => {
    const fixture = createFixture();
    writeFileSync(fixture.governancePath, "null\n", "utf8");
    const report = runMain(fixture);

    expect(report.status).toBe("FAIL");
    expect(report.governance_status).toBe("missing");
  });
});
