import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const auditScript = fileURLToPath(
  new URL("../scripts/main-governance-audit.mjs", import.meta.url),
);

function compliantRules() {
  return [
    {
      type: "pull_request",
      ruleset_id: 101,
      ruleset_source_type: "Repository",
      ruleset_source: "ContextualWisdomLab/noema",
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
      ruleset_source: "ContextualWisdomLab/noema",
      parameters: {
        do_not_enforce_on_create: false,
        strict_required_status_checks_policy: true,
        required_status_checks: [
          "verify",
          "reviewer",
          "scorecard",
          "osv-scan",
          "trivy-fs",
          "dependency-review",
        ].map((context, index) => ({
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

function runAudit(ghOutput: Buffer) {
  const directory = mkdtempSync(join(tmpdir(), "noema-main-governance-bytes-"));
  try {
    const binaryDirectory = join(directory, "bin");
    mkdirSync(binaryDirectory);
    const ghPath = join(binaryDirectory, "gh");
    writeFileSync(
      ghPath,
      [
        "#!/usr/bin/env node",
        `process.stdout.write(Buffer.from(${JSON.stringify(ghOutput.toString("base64"))}, "base64"));`,
        "",
      ].join("\n"),
      "utf8",
    );
    chmodSync(ghPath, 0o755);

    const tokenPath = join(directory, "maintainer-token");
    const reportPath = join(directory, "governance-report.json");
    writeFileSync(tokenPath, "bounded-test-token", { mode: 0o600 });

    const completed = spawnSync(process.execPath, [auditScript], {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${binaryDirectory}${delimiter}${process.env.PATH ?? ""}`,
        GITHUB_REPOSITORY: "ContextualWisdomLab/noema",
        NOEMA_MAINTAINER_TOKEN_PATH: tokenPath,
        NOEMA_GOVERNANCE_AUDIT_PATH: reportPath,
      },
    });
    const report = JSON.parse(readFileSync(reportPath, "utf8")) as {
      status: string;
      failures: Array<{ code: string; detail: string }>;
    };
    return { completed, report };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function expectCollectionFailure(
  outcome: ReturnType<typeof runAudit>,
  expectedDetail: string,
) {
  expect(outcome.completed.status).toBe(1);
  expect(outcome.report.status).toBe("FAIL");
  expect(outcome.report.failures).toEqual([
    expect.objectContaining({
      code: "governance_collection_failed",
      detail: expect.stringContaining(expectedDetail),
    }),
  ]);
}

describe("main-governance GitHub API byte integrity", () => {
  it("rejects escape-equivalent duplicate keys before governance evaluation", () => {
    const ambiguous = JSON.stringify([compliantRules()]).replace(
      '"type":"pull_request"',
      '"type":"deletion","t\\u0079pe":"pull_request"',
    );

    expectCollectionFailure(
      runAudit(Buffer.from(ambiguous, "utf8")),
      "duplicate decoded JSON key",
    );
  });

  it("rejects malformed UTF-8 instead of replacement-decoding governance evidence", () => {
    const valid = Buffer.from(JSON.stringify([compliantRules()]), "utf8");
    const sourceIdentity = Buffer.from("ContextualWisdomLab/noema", "utf8");
    const sourceOffset = valid.indexOf(sourceIdentity);
    expect(sourceOffset).toBeGreaterThanOrEqual(0);
    const malformed = Buffer.concat([
      valid.subarray(0, sourceOffset),
      Buffer.from([0xc3, 0x28]),
      valid.subarray(sourceOffset + sourceIdentity.length),
    ]);

    expectCollectionFailure(runAudit(malformed), "invalid UTF-8");
  });
});
