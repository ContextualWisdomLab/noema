import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const repository = "ContextualWisdomLab/noema";
const commitSha = "a".repeat(40);
const oldVersionId = "v1-old123";
const newVersionId = "v1-abc123";

function fixture(temp: string) {
  const paths = {
    wrangler: join(temp, "wrangler.ndjson"),
    before: join(temp, "before.json"),
    after: join(temp, "after.json"),
    smoke: join(temp, "smoke.json"),
    kpi: join(temp, "kpi.json"),
    releaseEvidence: join(temp, "release-evidence.json"),
    releaseView: join(temp, "release-view.json"),
    output: join(temp, "deployment-evidence.json"),
  };
  const wrangler = [
    { type: "wrangler-session", version: 1, timestamp: "2026-08-03T23:59:58.000Z" },
    {
      type: "deploy",
      version: 1,
      worker_name: "noema",
      version_id: newVersionId,
      targets: ["https://noema.example.workers.dev"],
      wrangler_environment: "production",
      timestamp: "2026-08-04T00:00:01.000Z",
    },
  ];
  writeFileSync(paths.wrangler, `${wrangler.map((record) => JSON.stringify(record)).join("\n")}\n`);
  writeFileSync(paths.before, JSON.stringify([
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      created_on: "2026-08-03T20:00:00.000Z",
      versions: [{ version_id: oldVersionId, percentage: 100 }],
    },
  ]));
  writeFileSync(paths.after, JSON.stringify([
    {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      created_on: "2026-08-04T00:00:02.000Z",
      versions: [{ version_id: newVersionId, percentage: 100 }],
    },
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      created_on: "2026-08-03T20:00:00.000Z",
      versions: [{ version_id: oldVersionId, percentage: 100 }],
    },
  ]));
  writeFileSync(paths.smoke, JSON.stringify({
    passed: true,
    timestamp: "2026-08-04T00:00:04Z",
    noema_exchange_url: "https://noema.example.workers.dev/exchange",
  }));
  writeFileSync(paths.kpi, JSON.stringify({
    status: "PASS",
    strict: true,
    requireWindowDays: 30,
    executedAt: "2026-08-03T23:59:50.000Z",
  }));
  writeFileSync(paths.releaseEvidence, JSON.stringify({
    schemaVersion: 1,
    source: {
      repository,
      commitSha,
      ref: "refs/tags/v0.1.0",
      version: "0.1.0",
    },
  }));
  writeFileSync(paths.releaseView, JSON.stringify({
    isImmutable: true,
    tagName: "v0.1.0",
    url: `https://github.com/${repository}/releases/tag/v0.1.0`,
  }));
  return paths;
}

function runDeploymentEvidence(paths: ReturnType<typeof fixture>) {
  return spawnSync(process.execPath, [
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
    env: {
      ...process.env,
      GITHUB_REPOSITORY: repository,
      NOEMA_DEPLOY_RELEASE_TAG: "v0.1.0",
      NOEMA_DEPLOY_COMMIT_SHA: commitSha,
      NOEMA_DEPLOY_ENVIRONMENT: "production",
      NOEMA_DEPLOY_WORKFLOW_RUN_URL: `${repository}/actions/runs/123`,
      NOEMA_DEPLOY_GENERATED_AT: "2026-08-04T00:00:05.000Z",
    },
    encoding: "utf8",
  });
}

function malformedJsonBytes(prefix: string, suffix: string) {
  return Buffer.concat([Buffer.from(prefix, "utf8"), Buffer.from([0xff]), Buffer.from(suffix, "utf8")]);
}

describe("deployment evidence UTF-8 byte integrity", () => {
  it("keeps the valid CLI fixture passing", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-deployment-evidence-valid-"));
    try {
      const paths = fixture(temp);
      const result = runDeploymentEvidence(paths);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("deployment-evidence: PASS");
      expect(existsSync(paths.output)).toBe(true);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("rejects malformed UTF-8 in an otherwise valid JSON input", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-deployment-evidence-json-utf8-"));
    try {
      const paths = fixture(temp);
      writeFileSync(paths.releaseView, malformedJsonBytes(
        `{"isImmutable":true,"tagName":"v0.1.0","url":"https://github.com/${repository}/releases/tag/v0.1.0","note":"safe`,
        'value"}',
      ));

      const result = runDeploymentEvidence(paths);

      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/invalid UTF-8/i);
      expect(existsSync(paths.output)).toBe(false);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("rejects malformed UTF-8 in otherwise valid Wrangler NDJSON", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-deployment-evidence-ndjson-utf8-"));
    try {
      const paths = fixture(temp);
      const first = Buffer.from(
        '{"type":"wrangler-session","version":1,"timestamp":"2026-08-03T23:59:58.000Z","note":"safe',
        "utf8",
      );
      const rest = Buffer.from(
        `value"}\n${JSON.stringify({
          type: "deploy",
          version: 1,
          worker_name: "noema",
          version_id: newVersionId,
          targets: ["https://noema.example.workers.dev"],
          wrangler_environment: "production",
          timestamp: "2026-08-04T00:00:01.000Z",
        })}\n`,
        "utf8",
      );
      writeFileSync(paths.wrangler, Buffer.concat([first, Buffer.from([0xff]), rest]));

      const result = runDeploymentEvidence(paths);

      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/invalid UTF-8/i);
      expect(existsSync(paths.output)).toBe(false);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });
});
