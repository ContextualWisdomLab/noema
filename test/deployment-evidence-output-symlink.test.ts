import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const repository = "ContextualWisdomLab/noema";
const commitSha = "a".repeat(40);
const tempRoots: string[] = [];

function writeJson(path: string, value: unknown) {
  writeFileSync(path, `${JSON.stringify(value)}\n`);
}

function makeFixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), "noema-deployment-output-"));
  tempRoots.push(root);
  const paths = {
    wrangler: join(root, "wrangler.ndjson"),
    before: join(root, "before.json"),
    after: join(root, "after.json"),
    smoke: join(root, "smoke.json"),
    kpi: join(root, "kpi.json"),
    releaseEvidence: join(root, "release-evidence.json"),
    releaseView: join(root, "release-view.json"),
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
  writeJson(paths.releaseView, {
    isImmutable: true,
    tagName: "v0.1.0",
    url: `https://github.com/${repository}/releases/tag/v0.1.0`,
  });

  return { root, paths };
}

function runDeployment(paths: ReturnType<typeof makeFixtureRoot>["paths"], output: string) {
  return spawnSync(process.execPath, [
    "scripts/deployment-evidence.mjs",
    "--wrangler-output", paths.wrangler,
    "--before-deployments", paths.before,
    "--after-deployments", paths.after,
    "--smoke", paths.smoke,
    "--kpi", paths.kpi,
    "--release-evidence", paths.releaseEvidence,
    "--release-view", paths.releaseView,
    "--output", output,
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
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe.skipIf(process.platform === "win32")(
  "deployment evidence private output boundary",
  () => {
    it("refuses a pre-existing output symlink without modifying its target", () => {
      const { root, paths } = makeFixtureRoot();
      const output = join(root, "evidence", "deployment-evidence.json");
      mkdirSync(dirname(output), { recursive: true });
      const sentinel = join(root, "sentinel.txt");
      writeFileSync(sentinel, "sentinel\n");
      symlinkSync(sentinel, output);

      const result = runDeployment(paths, output);

      expect(result.status).not.toBe(0);
      expect(readFileSync(sentinel, "utf8")).toBe("sentinel\n");
    });

    it("refuses a symlinked output parent without creating redirected deployment evidence", () => {
      const { root, paths } = makeFixtureRoot();
      const externalDir = join(root, "external-output");
      const linkedDir = join(root, "evidence");
      mkdirSync(externalDir, { recursive: true });
      symlinkSync(externalDir, linkedDir, "dir");
      const output = join(linkedDir, "deployment-evidence.json");

      const result = runDeployment(paths, output);

      expect(result.status).not.toBe(0);
      expect(existsSync(join(externalDir, "deployment-evidence.json"))).toBe(false);
    });
  },
);
