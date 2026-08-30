import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
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
  const directory = mkdtempSync(join(tmpdir(), "noema-main-governance-output-"));
  temporaryDirectories.push(directory);
  return directory;
}

function installFakeGh(directory: string, protectedMainSha: string) {
  const fakeGhPath = join(directory, "gh");
  const rules = compliantRules();
  writeFileSync(
    fakeGhPath,
    `#!/usr/bin/env node\n`
      + `const args = process.argv.slice(2).join(" ");\n`
      + `const sha = ${JSON.stringify(protectedMainSha)};\n`
      + `const rules = ${JSON.stringify(rules)};\n`
      + `if (args.includes("/rules/branches/main")) {\n`
      + `  process.stdout.write(JSON.stringify([rules]));\n`
      + `  process.exit(0);\n`
      + `}\n`
      + `if (args.includes("/branches/main")) {\n`
      + `  process.stdout.write(JSON.stringify({ name: "main", protected: true, commit: { sha } }));\n`
      + `  process.exit(0);\n`
      + `}\n`
      + `process.stderr.write("unexpected gh api request");\n`
      + `process.exit(2);\n`,
    { encoding: "utf8", mode: 0o700 },
  );
  chmodSync(fakeGhPath, 0o700);
  return fakeGhPath;
}

function configureAuditEnvironment(directory: string, tokenPath: string, reportPath: string) {
  process.env.GITHUB_REPOSITORY = "ContextualWisdomLab/noema";
  process.env.NOEMA_MAINTAINER_TOKEN_PATH = tokenPath;
  process.env.NOEMA_GOVERNANCE_AUDIT_PATH = reportPath;
  process.env.PATH = `${directory}:${originalEnvironment.PATH ?? ""}`;
  process.exitCode = undefined;
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

describe("main governance retained report output integrity", () => {
  it("refuses a symbolic-link report target instead of overwriting unrelated buyer evidence", () => {
    const directory = makeTemporaryDirectory();
    const protectedMainSha = "a".repeat(40);
    installFakeGh(directory, protectedMainSha);

    const tokenPath = join(directory, "maintainer-token");
    const unrelatedEvidencePath = join(directory, "unrelated-buyer-evidence.json");
    const reportPath = join(directory, "main-governance-audit.json");
    const unrelatedEvidence = "{\"authority\":\"must-survive\"}\n";

    writeFileSync(tokenPath, "delegated-token", { encoding: "utf8", mode: 0o600 });
    writeFileSync(unrelatedEvidencePath, unrelatedEvidence, "utf8");
    symlinkSync(unrelatedEvidencePath, reportPath);
    configureAuditEnvironment(directory, tokenPath, reportPath);

    expect(() => runMainGovernanceAudit()).toThrow();
    expect(readFileSync(unrelatedEvidencePath, "utf8")).toBe(unrelatedEvidence);
  });

  it("refuses a symbolic-link report parent before creating directories through it", () => {
    const directory = makeTemporaryDirectory();
    const protectedMainSha = "b".repeat(40);
    installFakeGh(directory, protectedMainSha);

    const tokenPath = join(directory, "maintainer-token");
    const unrelatedTree = join(directory, "unrelated-buyer-tree");
    const reportParent = join(directory, "report-parent");
    const reportPath = join(reportParent, "nested", "main-governance-audit.json");
    const unintendedDirectory = join(unrelatedTree, "nested");

    writeFileSync(tokenPath, "delegated-token", { encoding: "utf8", mode: 0o600 });
    mkdirSync(unrelatedTree);
    symlinkSync(unrelatedTree, reportParent, "dir");
    configureAuditEnvironment(directory, tokenPath, reportPath);

    expect(() => runMainGovernanceAudit()).toThrow();
    expect(existsSync(unintendedDirectory)).toBe(false);
  });

  it("refuses a lexically noncanonical report path instead of normalizing it into output authority", () => {
    const directory = makeTemporaryDirectory();
    const protectedMainSha = "c".repeat(40);
    installFakeGh(directory, protectedMainSha);

    const tokenPath = join(directory, "maintainer-token");
    const escapedReportPath = join(directory, "escaped-governance.json");
    const reportPath = `${directory}/report-parent/../escaped-governance.json`;

    writeFileSync(tokenPath, "delegated-token", { encoding: "utf8", mode: 0o600 });
    configureAuditEnvironment(directory, tokenPath, reportPath);

    expect(() => runMainGovernanceAudit()).toThrow();
    expect(existsSync(escapedReportPath)).toBe(false);
  });
});
