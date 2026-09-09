import { evaluateAcquisitionDeploymentEvidence } from "./acquisition-deployment-evidence.mjs";
import { evaluateExternalExtensionLifecycleOperabilityEvidence } from "./external-extension-lifecycle-operability-evidence.mjs";

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function addCheck(checks, failures, code, pass, detail) {
  checks.push({ code, pass });
  if (!pass) failures.push({ code, detail });
}

function boundedFailureCodes(evaluation) {
  if (!Array.isArray(evaluation?.failures)) return "unknown";
  const codes = evaluation.failures
    .map((failure) => typeof failure?.code === "string" ? failure.code : "invalid_failure")
    .slice(0, 12);
  return codes.length === 0 ? "unknown" : codes.join(",");
}

/**
 * Bind remote lifecycle operability observations to Noema's canonical acquisition deployment gate.
 *
 * Lifecycle evidence remains owned by the Tool Capability / State boundary. Release-tag, production
 * deployment, governance, Sigstore verification-receipt, and immutable-release authority stay in
 * evaluateAcquisitionDeploymentEvidence; this function only requires that authority to pass and
 * binds the observed protected/deployed lifecycle revision to its exact deployment commit.
 */
export function evaluateExternalExtensionLifecycleOperabilityEvidenceWithDeploymentAuthority(
  evidence,
  deploymentAuthorityInput,
) {
  const lifecycle = evaluateExternalExtensionLifecycleOperabilityEvidence(evidence);
  const deploymentAuthority = evaluateAcquisitionDeploymentEvidence(deploymentAuthorityInput);
  const checks = [...lifecycle.checks];
  const failures = [...lifecycle.failures];

  addCheck(
    checks,
    failures,
    "deployment_authority",
    deploymentAuthority.pass === true,
    deploymentAuthority.pass === true
      ? "canonical acquisition deployment authority passed"
      : `canonical acquisition deployment authority failed (${boundedFailureCodes(deploymentAuthority)})`,
  );

  const deploymentCommitSha = isRecord(deploymentAuthorityInput)
    && isRecord(deploymentAuthorityInput.deploymentEvidence)
    && isRecord(deploymentAuthorityInput.deploymentEvidence.source)
    ? deploymentAuthorityInput.deploymentEvidence.source.commitSha
    : null;
  const lifecycleRevisionBound = deploymentAuthority.pass === true
    && isRecord(evidence)
    && typeof deploymentCommitSha === "string"
    && evidence.protected_main_sha === deploymentCommitSha
    && evidence.deployed_worker_sha === deploymentCommitSha;
  addCheck(
    checks,
    failures,
    "deployment_revision_binding",
    lifecycleRevisionBound,
    "lifecycle protected/deployed revision must equal the exact commit authorized by canonical acquisition deployment evidence",
  );

  return {
    status: failures.length === 0 ? "PASS" : "FAIL",
    checks,
    failures,
    metrics: lifecycle.metrics,
  };
}
