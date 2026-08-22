const EXPECTED_REPOSITORY = "ContextualWisdomLab/noema";
const EXPECTED_WORKER = "noema";
const EXPECTED_ENVIRONMENT = "production";
const EXPECTED_SIGNER_WORKFLOW = `${EXPECTED_REPOSITORY}/.github/workflows/cd.yml`;
const EXPECTED_PREDICATE_TYPE =
  "https://contextualwisdomlab.org/attestations/noema-deployment/v1";
const EXPECTED_OIDC_ISSUER = "https://token.actions.githubusercontent.com";
const shaPattern = /^[0-9a-f]{40}$/;
const digestPattern = /^[0-9a-f]{64}$/;
const tagPattern = /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function canonicalIdentity(value, pattern) {
  return typeof value === "string" && value === value.trim() && pattern.test(value);
}

function failure(code, detail) {
  return { code, detail };
}

function add(failures, condition, code, detail) {
  if (!condition) {
    failures.push(failure(code, detail));
  }
}

function isHttpsUrl(value, expectedPrefix = "") {
  try {
    const url = new URL(text(value));
    return url.protocol === "https:"
      && !url.username
      && !url.password
      && (!expectedPrefix || url.href.startsWith(expectedPrefix));
  } catch {
    return false;
  }
}

function validBundleNode(value) {
  if (!isObject(value)) {
    return false;
  }
  const signatures = value.dsseEnvelope?.signatures;
  return text(value.mediaType).startsWith("application/vnd.dev.sigstore.bundle")
    && isObject(value.verificationMaterial)
    && isObject(value.dsseEnvelope)
    && text(value.dsseEnvelope.payload).length > 0
    && Array.isArray(signatures)
    && signatures.length > 0
    && signatures.every((entry) => isObject(entry) && text(entry.sig).length > 0);
}

function validBundle(value) {
  return Array.isArray(value)
    ? value.length > 0 && value.every(validBundleNode)
    : validBundleNode(value);
}

export function evaluateAcquisitionDeploymentEvidence(input = {}) {
  const failures = [];
  const expectedTag = text(input.expectedTag);
  const deployment = input.deploymentEvidence;
  const governance = input.governanceEvidence;
  const receipt = input.verificationReceipt;
  const deploymentDigest = typeof input.deploymentEvidenceSha256 === "string"
    ? input.deploymentEvidenceSha256
    : "";

  add(
    failures,
    tagPattern.test(expectedTag),
    "selected_release_tag_invalid",
    "The release under diligence must be a semantic-version tag.",
  );
  add(
    failures,
    isObject(deployment),
    "deployment_evidence_invalid",
    "Deployment evidence must be a JSON object.",
  );
  add(
    failures,
    validBundle(input.attestationBundle),
    "attestation_bundle_invalid",
    "The Sigstore bundle must contain verification material and a signed DSSE envelope.",
  );
  add(
    failures,
    isObject(governance),
    "governance_evidence_invalid",
    "Production environment governance evidence must be a JSON object.",
  );
  add(
    failures,
    isObject(receipt),
    "attestation_verification_receipt_invalid",
    "Attestation verification receipt must be a JSON object.",
  );

  if (isObject(deployment)) {
    add(
      failures,
      deployment.schemaVersion === 1,
      "deployment_schema_invalid",
      "Deployment evidence schemaVersion must be 1.",
    );
    add(
      failures,
      deployment.source?.repository === EXPECTED_REPOSITORY,
      "deployment_repository_mismatch",
      `Deployment source repository must be ${EXPECTED_REPOSITORY}.`,
    );
    add(
      failures,
      deployment.source?.releaseTag === expectedTag,
      "deployment_release_tag_mismatch",
      `Deployment release tag must match ${expectedTag || "the selected release"}.`,
    );
    add(
      failures,
      deployment.source?.releaseRef === `refs/tags/${expectedTag}`,
      "deployment_release_ref_mismatch",
      `Deployment release ref must be refs/tags/${expectedTag || "<selected-tag>"}.`,
    );
    add(
      failures,
      canonicalIdentity(deployment.source?.commitSha, shaPattern),
      "deployment_commit_sha_invalid",
      "Deployment source commitSha must be a canonical lowercase full hexadecimal SHA.",
    );
    add(
      failures,
      deployment.deployment?.environment === EXPECTED_ENVIRONMENT,
      "deployment_environment_mismatch",
      "Deployment evidence must identify the production environment.",
    );
    add(
      failures,
      deployment.deployment?.workerName === EXPECTED_WORKER,
      "deployment_worker_mismatch",
      `Deployment evidence must identify the ${EXPECTED_WORKER} Worker.`,
    );
    add(
      failures,
      Number(deployment.deployment?.trafficPercentage) === 100,
      "deployment_traffic_not_full",
      "Deployment evidence must prove exactly 100% active traffic.",
    );
    add(
      failures,
      isHttpsUrl(
        deployment.deployment?.workflowRunUrl,
        `https://github.com/${EXPECTED_REPOSITORY}/actions/runs/`,
      ),
      "deployment_workflow_url_invalid",
      "Deployment evidence must contain the trusted repository workflow-run URL.",
    );
    add(
      failures,
      deployment.validation?.immutableRelease === true,
      "deployment_release_not_immutable",
      "Deployment validation must prove an immutable release.",
    );
    add(
      failures,
      deployment.validation?.strictKpi === true,
      "deployment_kpi_not_strict",
      "Deployment validation must prove strict KPI verification.",
    );
    add(
      failures,
      deployment.validation?.smokePassed === true,
      "deployment_smoke_failed",
      "Deployment validation must prove successful post-deployment smoke checks.",
    );
  }

  if (isObject(governance)) {
    add(
      failures,
      governance.schema_version === 1,
      "governance_schema_invalid",
      "Production governance schema_version must be 1.",
    );
    add(
      failures,
      governance.repository === EXPECTED_REPOSITORY,
      "governance_repository_mismatch",
      `Production governance repository must be ${EXPECTED_REPOSITORY}.`,
    );
    add(
      failures,
      governance.environment === EXPECTED_ENVIRONMENT,
      "governance_environment_mismatch",
      "Production governance must identify the production environment.",
    );
    add(
      failures,
      governance.status === "PASS",
      "governance_status_not_pass",
      "Production environment governance status must be PASS.",
    );
    add(
      failures,
      Number.isSafeInteger(Number(governance.reviewer_count))
        && Number(governance.reviewer_count) > 0
        && Array.isArray(governance.reviewers)
        && governance.reviewers.length > 0,
      "governance_reviewer_missing",
      "Production governance must retain at least one concrete deployment reviewer.",
    );
    const governanceChecks = Array.isArray(governance.checks) ? governance.checks : [];
    add(
      failures,
      governanceChecks.length > 0 && governanceChecks.every((entry) => entry?.pass === true),
      "governance_check_failed",
      "Every production environment governance check must pass.",
    );
    add(
      failures,
      Array.isArray(governance.failures) && governance.failures.length === 0,
      "governance_failures_present",
      "Production environment governance must contain no failures.",
    );
  }

  if (isObject(receipt)) {
    const deploymentCommitSha = typeof deployment?.source?.commitSha === "string"
      ? deployment.source.commitSha
      : "";
    const workflowRunUrl = text(deployment?.deployment?.workflowRunUrl);
    add(
      failures,
      receipt.schemaVersion === 1,
      "attestation_receipt_schema_invalid",
      "Attestation verification receipt schemaVersion must be 1.",
    );
    add(
      failures,
      receipt.verified === true,
      "attestation_not_verified",
      "Attestation verification receipt must record verified=true.",
    );
    add(
      failures,
      receipt.repository === EXPECTED_REPOSITORY,
      "attestation_repository_mismatch",
      `Attestation verification repository must be ${EXPECTED_REPOSITORY}.`,
    );
    add(
      failures,
      receipt.releaseTag === expectedTag,
      "attestation_release_tag_mismatch",
      "Attestation verification release tag must match the selected release.",
    );
    add(
      failures,
      canonicalIdentity(deploymentCommitSha, shaPattern)
        && canonicalIdentity(receipt.commitSha, shaPattern)
        && receipt.commitSha === deploymentCommitSha,
      "attestation_commit_sha_mismatch",
      "Attestation verification commit SHA must canonically match deployment evidence.",
    );
    add(
      failures,
      canonicalIdentity(deploymentDigest, digestPattern)
        && canonicalIdentity(receipt.deploymentEvidenceSha256, digestPattern)
        && receipt.deploymentEvidenceSha256 === deploymentDigest,
      "attestation_subject_digest_mismatch",
      "Attestation verification subject digest must canonically match deployment-evidence.json.",
    );
    add(
      failures,
      receipt.signerWorkflow === EXPECTED_SIGNER_WORKFLOW,
      "attestation_signer_mismatch",
      `Attestation signer workflow must be ${EXPECTED_SIGNER_WORKFLOW}.`,
    );
    add(
      failures,
      receipt.predicateType === EXPECTED_PREDICATE_TYPE,
      "attestation_predicate_mismatch",
      `Attestation predicate type must be ${EXPECTED_PREDICATE_TYPE}.`,
    );
    add(
      failures,
      receipt.oidcIssuer === EXPECTED_OIDC_ISSUER,
      "attestation_oidc_issuer_mismatch",
      `Attestation OIDC issuer must be ${EXPECTED_OIDC_ISSUER}.`,
    );
    add(
      failures,
      receipt.denySelfHostedRunners === true,
      "attestation_runner_policy_missing",
      "Attestation verification must deny self-hosted runners.",
    );
    add(
      failures,
      receipt.workflowRunUrl === workflowRunUrl && isHttpsUrl(workflowRunUrl),
      "attestation_workflow_url_mismatch",
      "Attestation verification workflow URL must match deployment evidence.",
    );
  }

  return { pass: failures.length === 0, failures };
}
