import { describe, expect, it } from "vitest";
import { planExactRecoveryDeployment } from "../scripts/lib/cloudflare-recovery-plan.mjs";

const failedDeploymentId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const previousDeploymentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const previousVersionA = "22222222-2222-4222-8222-222222222222";
const previousVersionB = "33333333-3333-4333-8333-333333333333";

function receipt() {
  return {
    schemaVersion: 1,
    generatedAt: "2026-09-11T06:10:05.000Z",
    deployment: {
      deploymentId: failedDeploymentId,
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
    expect(planExactRecoveryDeployment(receipt(), failedDeploymentId)).toEqual({
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
    )).toThrow("current active deployment");
  });

  it("refuses recovery authority that was not admitted by the recovery contract", () => {
    const malformed = receipt();
    malformed.rollback.previousDeployment.versions[0].percentage = 30;
    expect(() => planExactRecoveryDeployment(malformed, failedDeploymentId)).toThrow("percentage");
  });

  it("refuses a first-deployment receipt because there is no prior state to restore", () => {
    const first = receipt();
    first.rollback.previousDeployment = null as never;
    first.rollback.previousDeploymentId = null as never;
    expect(() => planExactRecoveryDeployment(first, failedDeploymentId)).toThrow("no previous deployment");
  });
});
