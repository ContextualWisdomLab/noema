import { evaluateAcquisitionDeploymentEvidence } from "./acquisition-deployment-evidence.mjs";
import { evaluateExternalExtensionLifecycleOperabilityEvidence } from "./external-extension-lifecycle-operability-evidence.mjs";

const REPOSITORY = "ContextualWisdomLab/noema";
const SIGNER_WORKFLOW = `${REPOSITORY}/.github/workflows/cd.yml`;
const PREDICATE_TYPE = "https://contextualwisdomlab.org/attestations/noema-lifecycle-operability/v1";
const OIDC_ISSUER = "https://token.actions.githubusercontent.com";
const SHA256 = /^[0-9a-f]{64}$/u;

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
 * Bind remote lifecycle observations to canonical deployment authority and an independently
 * verified lifecycle-evidence attestation receipt.
 *
 * `lifecycleEvidenceSha256` must be computed by the descriptor-safe caller from the exact retained
 * evidence bytes; accepting an evidence-supplied digest here would make the binding circular.
 * Cryptographic verification remains an external release operation: this function validates the
 * retained verification receipt and its binding, while evaluateAcquisitionDeploymentEvidence keeps
 * ownership of release/deployment/governance/Sigstore authority.
 */
export function evaluateExternalExtensionLifecycleOperabilityEvidenceWithDeploymentAuthority(
  evidence,
  deploymentAuthorityInput,
  lifecycleEvidenceSha256,
  lifecycleVerificationReceipt,
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

  const deployment = isRecord(deploymentAuthorityInput?.deploymentEvidence)
    ? deploymentAuthorityInput.deploymentEvidence
    : {};
  const source = isRecord(deployment.source) ? deployment.source : {};
  const deploymentNode = isRecord(deployment.deployment) ? deployment.deployment : {};
  const deploymentCommitSha = source.commitSha;
  const expectedTag = deploymentAuthorityInput?.expectedTag;
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

  const receipt = isRecord(lifecycleVerificationReceipt) ? lifecycleVerificationReceipt : {};
  const lifecycleReceiptValid = deploymentAuthority.pass === true
    && lifecycleRevisionBound
    && typeof lifecycleEvidenceSha256 === "string"
    && SHA256.test(lifecycleEvidenceSha256)
    && receipt.schemaVersion === 1
    && receipt.verified === true
    && receipt.repository === REPOSITORY
    && receipt.releaseTag === expectedTag
    && receipt.commitSha === deploymentCommitSha
    && receipt.lifecycleEvidenceSha256 === lifecycleEvidenceSha256
    && receipt.signerWorkflow === SIGNER_WORKFLOW
    && receipt.predicateType === PREDICATE_TYPE
    && receipt.oidcIssuer === OIDC_ISSUER
    && receipt.denySelfHostedRunners === true
    && typeof deploymentNode.workflowRunUrl === "string"
    && receipt.workflowRunUrl === deploymentNode.workflowRunUrl;
  addCheck(
    checks,
    failures,
    "lifecycle_attestation_receipt",
    lifecycleReceiptValid,
    "lifecycle evidence must be bound to its exact retained-byte SHA-256 by a verified trusted-workflow receipt for the same release, commit, and deployment run",
  );

  return {
    status: failures.length === 0 ? "PASS" : "FAIL",
    checks,
    failures,
    metrics: lifecycle.metrics,
  };
}
