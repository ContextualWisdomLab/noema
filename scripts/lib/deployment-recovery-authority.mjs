const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ISO_CALENDAR_PREFIX_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T/;
export const RECOVERY_OBJECTIVE = "restore_exact_pre_deployment_distribution";

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function canonicalUuid(value) {
  if (typeof value !== "string" || value !== value.trim() || !UUID_PATTERN.test(value)) {
    return null;
  }
  return value.toLowerCase();
}

function validTimestamp(value) {
  if (typeof value !== "string" || value !== value.trim()) {
    return false;
  }
  const calendar = value.match(ISO_CALENDAR_PREFIX_PATTERN);
  if (!calendar || !Number.isFinite(Date.parse(value))) {
    return false;
  }
  const year = Number(calendar[1]);
  const month = Number(calendar[2]);
  const day = Number(calendar[3]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysPerMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= daysPerMonth[month - 1];
}

function failure(code, detail) {
  return { code, detail };
}

export function evaluateDeploymentRecoveryAuthority(deploymentEvidence) {
  const failures = [];
  const rollback = deploymentEvidence?.rollback;
  if (!isObject(rollback)) {
    return [failure("deployment_recovery_authority_missing", "Deployment evidence must contain rollback authority.")];
  }
  if (rollback.objective !== RECOVERY_OBJECTIVE) {
    failures.push(failure(
      "deployment_recovery_objective_invalid",
      `Rollback objective must be ${RECOVERY_OBJECTIVE}.`,
    ));
  }

  const previous = rollback.previousDeployment;
  if (previous === null) {
    if (rollback.previousDeploymentId !== null || rollback.previousWorkerVersionId !== null) {
      failures.push(failure(
        "deployment_recovery_first_deployment_invalid",
        "A first deployment must not invent previous deployment or Worker version identities.",
      ));
    }
    return failures;
  }
  if (!isObject(previous)) {
    failures.push(failure(
      "deployment_recovery_previous_deployment_invalid",
      "Rollback authority must retain the previous deployment object or explicit null for a first deployment.",
    ));
    return failures;
  }

  const previousDeploymentId = canonicalUuid(previous.deploymentId);
  const rollbackPreviousDeploymentId = canonicalUuid(rollback.previousDeploymentId);
  if (!previousDeploymentId || !rollbackPreviousDeploymentId || previousDeploymentId !== rollbackPreviousDeploymentId) {
    failures.push(failure(
      "deployment_recovery_deployment_id_invalid",
      "Retained previous deployment ID must be a UUID and match rollback.previousDeploymentId.",
    ));
  }
  const currentDeploymentId = canonicalUuid(deploymentEvidence?.deployment?.deploymentId);
  if (previousDeploymentId && currentDeploymentId && previousDeploymentId === currentDeploymentId) {
    failures.push(failure(
      "deployment_recovery_deployment_identity_reused",
      "Pre-mutation deployment identity must differ from the new active deployment identity.",
    ));
  }
  if (!validTimestamp(previous.observedAt) || !validTimestamp(previous.createdAt)) {
    failures.push(failure(
      "deployment_recovery_timestamp_invalid",
      "Previous deployment observation and creation timestamps must be canonical timestamps with valid calendar dates.",
    ));
  } else {
    const observedAt = Date.parse(previous.observedAt);
    const createdAt = Date.parse(previous.createdAt);
    const generatedAt = Date.parse(deploymentEvidence?.generatedAt);
    if (createdAt > observedAt || !Number.isFinite(generatedAt) || observedAt > generatedAt) {
      failures.push(failure(
        "deployment_recovery_timestamp_order_invalid",
        "Previous deployment creation must precede observation, which must not postdate evidence generation.",
      ));
    }
  }

  if (!Array.isArray(previous.versions) || previous.versions.length < 1 || previous.versions.length > 2) {
    failures.push(failure(
      "deployment_recovery_versions_invalid",
      "Previous deployment must retain one or two active Worker versions.",
    ));
    return failures;
  }

  const seen = new Set();
  let total = 0;
  let priorId = "";
  const canonicalVersionIds = [];
  for (const version of previous.versions) {
    const workerVersionId = isObject(version) ? canonicalUuid(version.workerVersionId) : null;
    if (!workerVersionId) {
      failures.push(failure(
        "deployment_recovery_version_id_invalid",
        "Every retained previous Worker version identity must be a UUID.",
      ));
      canonicalVersionIds.push(null);
      continue;
    }
    canonicalVersionIds.push(workerVersionId);
    if (seen.has(workerVersionId)) {
      failures.push(failure(
        "deployment_recovery_version_duplicate",
        "Retained previous Worker version identities must be unique.",
      ));
    }
    seen.add(workerVersionId);
    if (priorId && priorId.localeCompare(workerVersionId) >= 0) {
      failures.push(failure(
        "deployment_recovery_version_order_noncanonical",
        "Retained previous Worker versions must be canonically ordered by identity.",
      ));
    }
    priorId = workerVersionId;
    if (
      typeof version.percentage !== "number"
      || !Number.isFinite(version.percentage)
      || version.percentage < 0.01
      || version.percentage > 100
    ) {
      failures.push(failure(
        "deployment_recovery_percentage_invalid",
        "Every retained previous Worker version percentage must be at least 0.01 and no more than 100.",
      ));
    } else {
      total += version.percentage;
    }
  }
  if (Math.abs(total - 100) > 1e-9) {
    failures.push(failure(
      "deployment_recovery_percentage_total_invalid",
      "Retained previous Worker version percentages must total exactly 100.",
    ));
  }

  const singleVersion = previous.versions.length === 1
    && previous.versions[0]?.percentage === 100
    ? canonicalVersionIds[0]
    : null;
  const legacyWorkerVersionRaw = rollback.previousWorkerVersionId;
  const legacyWorkerVersionId = legacyWorkerVersionRaw === null
    ? null
    : canonicalUuid(legacyWorkerVersionRaw);
  if ((legacyWorkerVersionRaw !== null && !legacyWorkerVersionId) || legacyWorkerVersionId !== singleVersion) {
    failures.push(failure(
      "deployment_recovery_legacy_target_ambiguous",
      "rollback.previousWorkerVersionId may exist only for an unambiguous single-version 100% previous deployment.",
    ));
  }

  return failures;
}
