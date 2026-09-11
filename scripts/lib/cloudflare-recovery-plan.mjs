import { evaluateDeploymentRecoveryAuthority } from "./deployment-recovery-authority.mjs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const WORKER_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;

function canonicalUuid(value, label) {
  if (typeof value !== "string" || value !== value.trim() || !UUID_PATTERN.test(value)) {
    throw new Error(`${label} must be a UUID`);
  }
  return value.toLowerCase();
}

function canonicalWorkerName(value, label) {
  if (typeof value !== "string" || value !== value.trim() || !WORKER_NAME_PATTERN.test(value)) {
    throw new Error(`${label} must be a valid Worker name`);
  }
  return value;
}

export function planExactRecoveryDeployment(deploymentEvidence, currentActiveDeploymentId, expectedWorkerName) {
  const failures = evaluateDeploymentRecoveryAuthority(deploymentEvidence);
  if (failures.length > 0) {
    throw new Error(`Recovery authority is invalid: ${failures.map((entry) => `${entry.code}: ${entry.detail}`).join("; ")}`);
  }

  const receiptWorkerName = canonicalWorkerName(
    deploymentEvidence?.deployment?.workerName,
    "deployment evidence Worker name",
  );
  const mutationTargetWorkerName = canonicalWorkerName(expectedWorkerName, "recovery mutation target Worker name");
  if (receiptWorkerName !== mutationTargetWorkerName) {
    throw new Error(
      `Refusing cross-Worker recovery: receipt Worker ${receiptWorkerName} does not match mutation target ${mutationTargetWorkerName}`,
    );
  }

  const expectedCurrentDeploymentId = canonicalUuid(
    deploymentEvidence?.deployment?.deploymentId,
    "deployment evidence current deployment ID",
  );
  const current = canonicalUuid(currentActiveDeploymentId, "current active deployment ID");
  if (current !== expectedCurrentDeploymentId) {
    throw new Error(
      `Refusing stale recovery: current active deployment ${current} does not match receipt deployment ${expectedCurrentDeploymentId}`,
    );
  }

  const previous = deploymentEvidence.rollback.previousDeployment;
  if (!previous) {
    throw new Error("Recovery receipt has no previous deployment to restore");
  }

  const previousDeploymentId = canonicalUuid(previous.deploymentId, "previous deployment ID");
  return {
    expectedCurrentDeploymentId,
    previousDeploymentId,
    request: {
      strategy: "percentage",
      versions: previous.versions.map(({ workerVersionId, percentage }, index) => ({
        version_id: canonicalUuid(workerVersionId, `previous Worker version ${index + 1} ID`),
        percentage,
      })),
      annotations: {
        "workers/message": `Restore Noema deployment ${previousDeploymentId}`,
        "workers/triggered_by": "noema-exact-recovery",
      },
    },
  };
}
