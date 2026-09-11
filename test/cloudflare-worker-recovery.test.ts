import { describe, expect, it } from "vitest";
import {
  planExactRecoveryDeployment,
  verifyExactRecoveryStatus,
} from "../scripts/lib/cloudflare-recovery-plan.mjs";

const failedDeploymentId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const previousDeploymentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const recoveryDeploymentId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const previousVersionA = "22222222-2222-4222-8222-222222222222";
const previousVersionB = "33333333-3333-4333-8333-333333333333";
const workerName = "noema";

function receipt() {
  return {
    schemaVersion: 1,
    generatedAt: "2026-09-11T06:10:05.000Z",
    deployment: {
      deploymentId: failedDeploymentId,
      workerName,
    },
    rollback: {
      objective: "restore_exact_pre_deployment_distribution",
      previousDeploymentId,
      previousWorkerVersionId: null,
      previousDeployment: {
        deploymentId: previousDeploymentId,
        observedAt: "2026-09-11T06:09:50.000Z",
        createdAt: "2026-09-10T20:00:00.000Z",
        versions: [
          { workerVersionId: previousVersionA, percentage: 60 },
          { workerVersionId: previousVersionB, percentage: 40 },
        ],
      },
    },
  };
}

describe("Cloudflare exact-distribution recovery plan", () => {
  it("builds a provider create-deployment request from retained recovery authority", () => {
    expect(planExactRecoveryDeployment(receipt(), failedDeploymentId, workerName)).toEqual({
      expectedCurrentDeploymentId: failedDeploymentId,
      previousDeploymentId,
      request: {
        strategy: "percentage",
        versions: [
          { version_id: previousVersionA, percentage: 60 },
          { version_id: previousVersionB, percentage: 40 },
        ],
        annotations: {
          "workers/message": `Restore Noema deployment ${previousDeploymentId}`,
          "workers/triggered_by": "noema-exact-recovery",
        },
      },
    });
  });

  it("treats UUID hex casing as one provider identity and emits canonical recovery IDs", () => {
    const aliased = receipt();
    aliased.deployment.deploymentId = failedDeploymentId.toUpperCase();
    aliased.rollback.previousDeploymentId = previousDeploymentId.toUpperCase();
    aliased.rollback.previousDeployment.deploymentId = previousDeploymentId.toUpperCase();
    aliased.rollback.previousDeployment.versions[0].workerVersionId = previousVersionA.toUpperCase();

    expect(planExactRecoveryDeployment(
      aliased,
      failedDeploymentId.toUpperCase(),
      workerName,
    )).toEqual({
      expectedCurrentDeploymentId: failedDeploymentId,
      previousDeploymentId,
      request: {
        strategy: "percentage",
        versions: [
          { version_id: previousVersionA, percentage: 60 },
          { version_id: previousVersionB, percentage: 40 },
        ],
        annotations: {
          "workers/message": `Restore Noema deployment ${previousDeploymentId}`,
          "workers/triggered_by": "noema-exact-recovery",
        },
      },
    });
  });

  it("fails closed when current provider state has moved since the failed deployment receipt", () => {
    expect(() => planExactRecoveryDeployment(
      receipt(),
      "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      workerName,
    )).toThrow("current active deployment");
  });

  it("fails closed when the receipt belongs to a different Worker than the mutation target", () => {
    expect(() => planExactRecoveryDeployment(
      receipt(),
      failedDeploymentId,
      "different-noema-worker",
    )).toThrow("Worker");
  });

  it("refuses recovery authority that was not admitted by the recovery contract", () => {
    const malformed = receipt();
    malformed.rollback.previousDeployment.versions[0].percentage = 30;
    expect(() => planExactRecoveryDeployment(malformed, failedDeploymentId, workerName)).toThrow("percentage");
  });

  it("refuses a case-aliased previous deployment that is the failed current deployment", () => {
    const malformed = receipt();
    malformed.rollback.previousDeploymentId = failedDeploymentId.toUpperCase();
    malformed.rollback.previousDeployment.deploymentId = failedDeploymentId.toUpperCase();
    expect(() => planExactRecoveryDeployment(malformed, failedDeploymentId, workerName)).toThrow(
      "Pre-mutation deployment identity must differ",
    );
  });

  it("refuses case-aliased duplicate Worker-version authority", () => {
    const malformed = receipt();
    malformed.rollback.previousDeployment.versions = [
      { workerVersionId: previousVersionA.toUpperCase(), percentage: 50 },
      { workerVersionId: previousVersionA, percentage: 50 },
    ];
    expect(() => planExactRecoveryDeployment(malformed, failedDeploymentId, workerName)).toThrow(
      "Worker version identities must be unique",
    );
  });

  it("refuses malformed legacy rollback identity even when split traffic has no legacy target", () => {
    const malformed = receipt();
    malformed.rollback.previousWorkerVersionId = "not-a-uuid";
    expect(() => planExactRecoveryDeployment(malformed, failedDeploymentId, workerName)).toThrow(
      "previousWorkerVersionId",
    );
  });

  it("refuses a first-deployment receipt because there is no prior state to restore", () => {
    const first = receipt();
    first.rollback.previousDeployment = null as never;
    first.rollback.previousDeploymentId = null as never;
    expect(() => planExactRecoveryDeployment(first, failedDeploymentId, workerName)).toThrow("no previous deployment");
  });
});

describe("Cloudflare exact-distribution recovery verification", () => {
  const request = planExactRecoveryDeployment(receipt(), failedDeploymentId, workerName).request;

  it("requires a fresh provider status read to show the recovery deployment and exact distribution", () => {
    expect(verifyExactRecoveryStatus({
      deployments: [{
        id: recoveryDeploymentId.toUpperCase(),
        versions: [
          { version_id: previousVersionB.toUpperCase(), percentage: 40 },
          { version_id: previousVersionA, percentage: 60 },
        ],
      }],
    }, recoveryDeploymentId, request)).toEqual({
      deploymentId: recoveryDeploymentId,
      versions: [
        { version_id: previousVersionA, percentage: 60 },
        { version_id: previousVersionB, percentage: 40 },
      ],
    });
  });

  it("fails closed when the provider status reread still exposes the failed deployment", () => {
    expect(() => verifyExactRecoveryStatus({
      deployments: [{
        id: failedDeploymentId,
        versions: request.versions,
      }],
    }, recoveryDeploymentId, request)).toThrow("recovery deployment ID");
  });

  it("fails closed when the fresh provider status distribution differs from the recovery request", () => {
    expect(() => verifyExactRecoveryStatus({
      deployments: [{
        id: recoveryDeploymentId,
        versions: [
          { version_id: previousVersionA, percentage: 100 },
        ],
      }],
    }, recoveryDeploymentId, request)).toThrow("exact requested distribution");
  });
});
