import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { main as runMainGovernanceAudit } from "../scripts/main-governance-audit.mjs";

const temporaryDirectories: string[] = [];
const originalEnvironment = { ...process.env };
const originalExitCode = process.exitCode;

function compliantRules() {
  const requiredChecks = [
    "verify",
    "reviewer",
    "scorecard",
    "osv-scan",
    "trivy-fs",
    "dependency-review",
  ];
  return [
    {
      type: "pull_request",
      ruleset_id: 101,
      ruleset_source_type: "Repository",
      ruleset_source: "ContextualWisdomLab/noema",
      parameters: {
        allowed_merge_methods: ["squash"],
        dismiss_stale_reviews_on_push: true,
        required_approving_review_count: 1,
        required_review_thread_resolution: true,
      },
    },
    {
      type: "required_status_checks",
      ruleset_id: 101,
      ruleset_source_type: "Repository",
      ruleset_source: "ContextualWisdomLab/noema",
      parameters: {
        strict_required_status_checks_policy: true,
        required_status_checks: requiredChecks.map((context, index) => ({
          context,
          integration_id: 15_368 + index,
        })),
      },
    },
    {
      type: "non_fast_forward",
      ruleset_id: 101,
      ruleset_source_type: "Repository",
      ruleset_source: "ContextualWisdomLab/noema",
    },
    {
      type: "deletion",
      ruleset_id: 101,
      ruleset_source_type: "Repository",
      ruleset_source: "ContextualWisdomLab/noema",
    },
  ];
}

function makeTemporaryDirectory() {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "noema-main-governance-source-")));
  temporaryDirectories.push(directory);
  return directory;
}

function runAudit(
  beforeSha: string,
  afterSha: string,
  protectedMain = true,
  executingSha = beforeSha,
) {
  const directory = makeTemporaryDirectory();
  const fakeGhPath = join(directory, "gh");
  const fakeGitPath = join(directory, "git");
  const branchReadCountPath = join(directory, "branch-read-count");
  const reportPath = join(directory, "main-governance-audit.json");
  const tokenPath = join(directory, "maintainer-token");
  const rules = compliantRules();

  writeFileSync(tokenPath, "delegated-token", { encoding: "utf8", mode: 0o600 });
  writeFileSync(
    fakeGhPath,
    `#!/usr/bin/env node\n`
      + `const fs = require("node:fs");\n`
      + `const args = process.argv.slice(2).join(" ");\n`
      + `const countPath = ${JSON.stringify(branchReadCountPath)};\n`
      + `const beforeSha = ${JSON.stringify(beforeSha)};\n`
      + `const afterSha = ${JSON.stringify(afterSha)};\n`
      + `const protectedMain = ${JSON.stringify(protectedMain)};\n`
      + `const rules = ${JSON.stringify(rules)};\n`
      + `if (args.includes("/rules/branches/main")) {\n`
      + `  process.stdout.write(JSON.stringify([rules]));\n`
      + `  process.exit(0);\n`
      + `}\n`
      + `if (args.includes("/branches/main")) {\n`
      + `  let count = 0;\n`
      + `  try { count = Number(fs.readFileSync(countPath, "utf8")); } catch {}\n`
      + `  const sha = count === 0 ? beforeSha : afterSha;\n`
      + `  fs.writeFileSync(countPath, String(count + 1));\n`
      + `  process.stdout.write(JSON.stringify({ name: "main", protected: protectedMain, commit: { sha } }));\n`
      + `  process.exit(0);\n`
      + `}\n`
      + `process.stderr.write("unexpected gh api request");\n`
      + `process.exit(2);\n`,
    { encoding: "utf8", mode: 0o700 },
  );
  writeFileSync(
    fakeGitPath,
    `#!/usr/bin/env node\n`
      + `const args = process.argv.slice(2);\n`
      + `if (args.length === 2 && args[0] === "rev-parse" && args[1] === "HEAD") {\n`
      + `  process.stdout.write(${JSON.stringify(`${executingSha}\n`)});\n`
      + `  process.exit(0);\n`
      + `}\n`
      + `process.stderr.write("unexpected git command");\n`
      + `process.exit(2);\n`,
    { encoding: "utf8", mode: 0o700 },
  );
  chmodSync(fakeGhPath, 0o700);
  chmodSync(fakeGitPath, 0o700);

  process.env.GITHUB_REPOSITORY = "ContextualWisdomLab/noema";
  process.env.NOEMA_MAINTAINER_TOKEN_PATH = tokenPath;
  process.env.NOEMA_GOVERNANCE_AUDIT_PATH = reportPath;
  process.env.PATH = `${directory}:${originalEnvironment.PATH ?? ""}`;
  process.exitCode = undefined;

  const report = runMainGovernanceAudit();
  const retainedReport = JSON.parse(readFileSync(reportPath, "utf8"));
  return { report, retainedReport };
}

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnvironment)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  process.exitCode = originalExitCode;
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("main governance retained source authority", () => {
  it("binds a passing governance report to the exact protected main revision observed before and after collection", () => {
    const protectedMainSha = "a".repeat(40);
    const { report, retainedReport } = runAudit(protectedMainSha, protectedMainSha);

    expect(report.status).toBe("PASS");
    expect(report.protected_main_sha).toBe(protectedMainSha);
    expect(retainedReport.protected_main_sha).toBe(protectedMainSha);
  });

  it("fails closed when the executing audit source is not the protected main revision", () => {
    const protectedMainSha = "b".repeat(40);
    const executingSha = "a".repeat(40);
    const { report, retainedReport } = runAudit(
      protectedMainSha,
      protectedMainSha,
      true,
      executingSha,
    );

    expect(report.status).toBe("FAIL");
    expect(report.protected_main_sha).toBeNull();
    expect(retainedReport.protected_main_sha).toBeNull();
    expect(report.failures).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "governance_collection_failed",
        detail: expect.stringContaining("Executing governance audit source does not match protected main"),
      }),
    ]));
  });

  it("fails closed instead of retaining governance authority when protected main moves during collection", () => {
    const { report, retainedReport } = runAudit("a".repeat(40), "b".repeat(40));

    expect(report.status).toBe("FAIL");
    expect(report.protected_main_sha).toBeNull();
    expect(retainedReport.protected_main_sha).toBeNull();
    expect(report.failures).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "governance_collection_failed",
        detail: expect.stringContaining("Protected main moved during governance collection"),
      }),
    ]));
  });

  it("fails closed when GitHub does not attest that main is protected", () => {
    const protectedMainSha = "a".repeat(40);
    const { report } = runAudit(protectedMainSha, protectedMainSha, false);

    expect(report.status).toBe("FAIL");
    expect(report.protected_main_sha).toBeNull();
    expect(report.failures).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "governance_collection_failed",
        detail: expect.stringContaining("GitHub does not report main as protected"),
      }),
    ]));
  });

  it("fails closed when protected-main source identity is not one canonical lowercase Git SHA", () => {
    const { report } = runAudit("A".repeat(40), "A".repeat(40));

    expect(report.status).toBe("FAIL");
    expect(report.protected_main_sha).toBeNull();
    expect(report.failures).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "governance_collection_failed",
        detail: expect.stringContaining("Protected main SHA is not canonical"),
      }),
    ]));
  });
});
