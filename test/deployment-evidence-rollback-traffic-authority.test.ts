import { describe, expect, it } from "vitest";
import { buildDeploymentEvidence } from "../scripts/deployment-evidence.mjs";

const repository = "ContextualWisdomLab/noema";
const commitSha = "a".repeat(40);
const newVersionId = "11111111-1111-4111-8111-111111111111";
const newDeploymentId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const oldDeploymentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const oldVersionA = "22222222-2222-4222-8222-222222222222";
const oldVersionB = "33333333-3333-4333-8333-333333333333";

function validInput() {
  return {
    identity: {
      repository,
      releaseTag: "v0.1.0",
      commitSha,
      environment: "production",
      workflowRunUrl: `${repository}/actions/runs/123`,
      generatedAt: "2026-09-11T06:10:05.000Z",
    },
    releaseView: {
      isImmutable: true,
      tagName: "v0.1.0",
      url: `https://github.com/${repository}/releases/tag/v0.1.0`,
    },
    releaseEvidence: {
      schemaVersion: 1,
      source: { repository, commitSha, ref: "refs/tags/v0.1.0", version: "0.1.0" },
    },
    deployOutput: {
      worker: "noema",
      source_sha: commitSha,
      version_id: newVersionId,
      deployment_id: newDeploymentId,
    },
    beforeDeployments: {
      observed_at: "2026-09-11T06:09:50.000Z",
      deployments: [
        {
          id: oldDeploymentId,
          created_on: "2026-09-10T20:00:00.000Z",
          versions: [
            { version_id: oldVersionB, percentage: 40 },
            { version_id: oldVersionA, percentage: 60 },
          ],
        },
      ],
    },
    afterDeployments: {
      observed_at: "2026-09-11T06:10:02.000Z",
      deployments: [
        {
          id: newDeploymentId,
          created_on: "2026-09-11T06:10:01.000Z",
          versions: [{ version_id: newVersionId, percentage: 100 }],
        },
      ],
    },
    smokeEvidence: {
      passed: true,
      timestamp: "2026-09-11T06:10:03.000Z",
      noema_exchange_url: "https://noema.example.workers.dev/exchange",
    },
    kpiEvidence: {
      status: "PASS",
      strict: true,
      requireWindowDays: 30,
      executedAt: "2026-09-11T06:09:40.000Z",
    },
    digests: {
      releaseEvidenceSha256: "1".repeat(64),
      smokeEvidenceSha256: "2".repeat(64),
      kpiEvidenceSha256: "3".repeat(64),
    },
  };
}

describe("deployment rollback traffic authority", () => {
  it("preserves the complete pre-mutation split and canonicalizes version order", () => {
    const evidence = buildDeploymentEvidence(validInput());

    expect(evidence.rollback).toEqual({
      objective: "restore_exact_pre_deployment_distribution",
      previousDeploymentId: oldDeploymentId,
      previousWorkerVersionId: null,
      previousDeployment: {
        deploymentId: oldDeploymentId,
        observedAt: "2026-09-11T06:09:50.000Z",
        createdAt: "2026-09-10T20:00:00.000Z",
        versions: [
          { workerVersionId: oldVersionA, percentage: 60 },
          { workerVersionId: oldVersionB, percentage: 40 },
        ],
      },
    });
  });

  it("is invariant to provider version-array ordering", () => {
    const left = validInput();
    const right = validInput();
    right.beforeDeployments.deployments[0].versions.reverse();

    expect(buildDeploymentEvidence(left).rollback).toEqual(buildDeploymentEvidence(right).rollback);
  });

  it("keeps the legacy single-version rollback identity only when authority is unambiguous", () => {
    const input = validInput();
    input.beforeDeployments.deployments[0].versions = [{ version_id: oldVersionA, percentage: 100 }];

    const rollback = buildDeploymentEvidence(input).rollback;
    expect(rollback.previousWorkerVersionId).toBe(oldVersionA);
    expect(rollback.previousDeployment?.versions).toEqual([
      { workerVersionId: oldVersionA, percentage: 100 },
    ]);
  });

  it("distinguishes first deployment from malformed rollback evidence", () => {
    const input = validInput();
    input.beforeDeployments.deployments = [];

    expect(buildDeploymentEvidence(input).rollback).toEqual({
      objective: "restore_exact_pre_deployment_distribution",
      previousDeploymentId: null,
      previousWorkerVersionId: null,
      previousDeployment: null,
    });
  });

  it.each([
    ["duplicate version identities", (input: ReturnType<typeof validInput>) => {
      input.beforeDeployments.deployments[0].versions[1].version_id = oldVersionB;
    }, "duplicate"],
    ["malformed version UUID", (input: ReturnType<typeof validInput>) => {
      input.beforeDeployments.deployments[0].versions[0].version_id = "not-a-uuid";
    }, "UUID"],
    ["malformed deployment UUID", (input: ReturnType<typeof validInput>) => {
      input.beforeDeployments.deployments[0].id = "not-a-uuid";
    }, "UUID"],
    ["zero percentage", (input: ReturnType<typeof validInput>) => {
      input.beforeDeployments.deployments[0].versions[0].percentage = 0;
      input.beforeDeployments.deployments[0].versions[1].percentage = 100;
    }, "percentage"],
    ["over-100 percentage total", (input: ReturnType<typeof validInput>) => {
      input.beforeDeployments.deployments[0].versions[0].percentage = 70;
      input.beforeDeployments.deployments[0].versions[1].percentage = 40;
    }, "100"],
    ["missing versions", (input: ReturnType<typeof validInput>) => {
      input.beforeDeployments.deployments[0].versions = [];
    }, "versions"],
    ["missing observation time", (input: ReturnType<typeof validInput>) => {
      delete (input.beforeDeployments as { observed_at?: string }).observed_at;
    }, "observed"],
  ])("fails closed for %s", (_label, mutate, message) => {
    const input = validInput();
    mutate(input);
    expect(() => buildDeploymentEvidence(input)).toThrow(message);
  });
});
