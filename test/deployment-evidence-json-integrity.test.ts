import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const repository = "ContextualWisdomLab/noema";
const commitSha = "a".repeat(40);

function writeJson(path: string, value: unknown) {
  writeFileSync(path, `${JSON.stringify(value)}\n`);
}

describe("deployment evidence JSON ambiguity", () => {
  it("rejects duplicate decoded release-view keys before deployment receipt construction", () => {
    const root = mkdtempSync(join(tmpdir(), "noema-deployment-json-integrity-"));
    try {
      const paths = {
        wrangler: join(root, "wrangler.ndjson"),
        before: join(root, "before.json"),
        after: join(root, "after.json"),
        smoke: join(root, "smoke.json"),
        kpi: join(root, "kpi.json"),
        releaseEvidence: join(root, "release-evidence.json"),
        releaseView: join(root, "release-view.json"),
        output: join(root, "deployment-evidence.json"),
      };
      writeFileSync(paths.wrangler, [
        JSON.stringify({ type: "wrangler-session", version: 1, timestamp: "2026-08-03T23:59:58.000Z" }),
        JSON.stringify({
          type: "deploy",
          version: 1,
          worker_name: "noema",
          version_id: "v1-abc123",
          targets: ["https://noema.example.workers.dev"],
          wrangler_environment: "production",
          timestamp: "2026-08-04T00:00:01.000Z",
        }),
        "",
      ].join("\n"));
      writeJson(paths.before, [{
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        created_on: "2026-08-03T20:00:00.000Z",
        versions: [{ version_id: "v1-old123", percentage: 100 }],
      }]);
      writeJson(paths.after, [{
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        created_on: "2026-08-04T00:00:02.000Z",
        versions: [{ version_id: "v1-abc123", percentage: 100 }],
      }]);
      writeJson(paths.smoke, {
        passed: true,
        timestamp: "2026-08-04T00:00:04Z",
        noema_exchange_url: "https://noema.example.workers.dev/exchange",
      });
      writeJson(paths.kpi, {
        status: "PASS",
        strict: true,
        requireWindowDays: 30,
        executedAt: "2026-08-03T23:59:50.000Z",
      });
      writeJson(paths.releaseEvidence, {
        schemaVersion: 1,
        source: {
          repository,
          commitSha,
          ref: "refs/tags/v0.1.0",
          version: "0.1.0",
        },
      });
      writeFileSync(
        paths.releaseView,
        `{"isImmutable":false,"isImm\\u0075table":true,"tagName":"v0.1.0","url":"https://github.com/${repository}/releases/tag/v0.1.0"}\n`,
      );

      const result = spawnSync(process.execPath, [
        "scripts/deployment-evidence.mjs",
        "--wrangler-output", paths.wrangler,
        "--before-deployments", paths.before,
        "--after-deployments", paths.after,
        "--smoke", paths.smoke,
        "--kpi", paths.kpi,
        "--release-evidence", paths.releaseEvidence,
        "--release-view", paths.releaseView,
        "--output", paths.output,
      ], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          GITHUB_REPOSITORY: repository,
          NOEMA_DEPLOY_RELEASE_TAG: "v0.1.0",
          NOEMA_DEPLOY_COMMIT_SHA: commitSha,
          NOEMA_DEPLOY_ENVIRONMENT: "production",
          NOEMA_DEPLOY_WORKFLOW_RUN_URL: `${repository}/actions/runs/123`,
          NOEMA_DEPLOY_GENERATED_AT: "2026-08-04T00:00:05.000Z",
        },
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("duplicate decoded JSON key");
      expect(existsSync(paths.output)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
