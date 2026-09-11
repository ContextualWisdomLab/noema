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

function canonicalDistribution(versions, label) {
  if (!Array.isArray(versions) || versions.length < 1 || versions.length > 2) {
    throw new Error(`${label} must contain one or two Worker versions`);
  }

  const seen = new Set();
  let total = 0;
  const canonical = versions.map((version, index) => {
    if (!version || typeof version !== "object" || Array.isArray(version)) {
      throw new Error(`${label} version ${index + 1} must be an object`);
    }
    const versionId = canonicalUuid(version.version_id, `${label} version ${index + 1} ID`);
    if (seen.has(versionId)) {
      throw new Error(`${label} contains duplicate Worker version IDs`);
    }
    seen.add(versionId);

    const percentage = version.percentage;
    if (
      typeof percentage !== "number"
      || !Number.isFinite(percentage)
      || percentage < 0.01
      || percentage > 100
    ) {
      throw new Error(`${label} version ${index + 1} percentage must be at least 0.01 and no more than 100`);
    }
    total += percentage;
    return { version_id: versionId, percentage };
  }).sort((left, right) => left.version_id.localeCompare(right.version_id));

  if (Math.abs(total - 100) > 1e-9) {
    throw new Error(`${label} percentages must total exactly 100`);
  }
  return canonical;
}

function activeDeployment(status) {
  const deployments = Array.isArray(status) ? status : status?.deployments;
  if (!Array.isArray(deployments) || deployments.length === 0) {
    throw new Error("Cloudflare recovery status did not return an active deployment");
  }
  const deployment = deployments[0];
  if (!deployment || typeof deployment !== "object" || Array.isArray(deployment)) {
    throw new Error("Cloudflare recovery status active deployment must be an object");
  }
  return deployment;
}

export function verifyExactRecoveryStatus(providerStatus, expectedRecoveryDeploymentId, request) {
  const deployment = activeDeployment(providerStatus);
  const expectedDeploymentId = canonicalUuid(
    expectedRecoveryDeploymentId,
    "expected recovery deployment ID",
  );
  const observedDeploymentId = canonicalUuid(
    deployment.id,
    "Cloudflare recovery status deployment ID",
  );
  if (observedDeploymentId !== expectedDeploymentId) {
    throw new Error(
      `Cloudflare recovery status recovery deployment ID ${observedDeploymentId} does not match expected ${expectedDeploymentId}`,
    );
  }

  const expectedVersions = canonicalDistribution(request?.versions, "recovery request distribution");
  const observedVersions = canonicalDistribution(
    deployment.versions,
    "Cloudflare recovery status distribution",
  );
  if (JSON.stringify(observedVersions) !== JSON.stringify(expectedVersions)) {
    throw new Error("Cloudflare recovery status does not match the exact requested distribution");
  }

  return {
    deploymentId: observedDeploymentId,
    versions: observedVersions,
  };
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
