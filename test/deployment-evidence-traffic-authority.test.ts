import { describe, expect, it } from "vitest";
import { buildDeploymentEvidence } from "../scripts/deployment-evidence.mjs";

const repository = "ContextualWisdomLab/noema";
const commitSha = "a".repeat(40);
const workerVersionId = "v1-abc123";

function validInput() {
  return {
    identity: {
      repository,
      releaseTag: "v0.1.0",
      commitSha,
      environment: "production",
      workflowRunUrl: `${repository}/actions/runs/123`,
      generatedAt: "2026-08-04T00:00:00.000Z",
    },
    releaseView: {
      isImmutable: true,
      tagName: "v0.1.0",
      url: `https://github.com/${repository}/releases/tag/v0.1.0`,
    },
    releaseEvidence: {
      schemaVersion: 1,
      source: {
        repository,
        commitSha,
        ref: "refs/tags/v0.1.0",
        version: "0.1.0",
      },
    },
    wranglerOutput: [{
      type: "deploy",
      worker_name: "noema",
      version_id: workerVersionId,
      targets: ["https://noema.example.workers.dev"],
      timestamp: "2026-08-04T00:00:01.000Z",
    }],
    beforeDeployments: [],
    afterDeployments: [{
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      created_on: "2026-08-04T00:00:02.000Z",
      versions: [{ version_id: workerVersionId, percentage: 100 }],
    }],
    smokeEvidence: {
      passed: true,
      timestamp: "2026-08-04T00:00:04Z",
      noema_exchange_url: "https://noema.example.workers.dev/exchange",
    },
    kpiEvidence: {
      status: "PASS",
      strict: true,
      requireWindowDays: 30,
      executedAt: "2026-08-03T23:59:50.000Z",
    },
    digests: {
      releaseEvidenceSha256: "1".repeat(64),
      smokeEvidenceSha256: "2".repeat(64),
      kpiEvidenceSha256: "3".repeat(64),
    },
  };
}

describe("deployment traffic authority", () => {
  it("rejects string-coerced 100 percent deployment status", () => {
    const input = validInput();
    (input.afterDeployments[0].versions[0] as { percentage: number | string }).percentage = "100";

    expect(() => buildDeploymentEvidence(input)).toThrow("100%");
  });
});
