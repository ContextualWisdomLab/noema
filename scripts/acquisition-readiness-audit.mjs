#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  MAX_DATA_ROOM_EVIDENCE_BYTES,
  MAX_DATA_ROOM_JSON_BYTES,
  readStableFile,
} from "./lib/acquisition-data-room-integrity.mjs";
import {
  assertAcquisitionPrivatePathParents,
  writeAcquisitionPrivateFile,
} from "./lib/acquisition-private-output.mjs";
import { evaluatePilotReadinessText } from "./lib/pilot-readiness.mjs";
import { hasDuplicateJsonObjectKeys } from "./normalize-commercial-readiness-evidence.mjs";

const fatalUtf8Decoder = new TextDecoder("utf-8", { fatal: true });
const isoDateOrTimestampRegex = /^(\d{4}-\d{2}-\d{2})(?:T(?:[01]\d|2[0-3]):\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/;
const MAX_ISO_UTC_OFFSET_MS = 14 * 60 * 60 * 1000;
const now = new Date().toISOString();
const outputDir = process.env.NOEMA_ACQUISITION_AUDIT_OUTPUT_DIR
  || join(process.cwd(), "artifacts", "acquisition-readiness", now.slice(0, 10).replace(/-/g, ""));
const auditFile = join(outputDir, "acquisition-audit.json");
const objective = "NOEMA-GOAL-ACQUISITION-2B-2026-07-02";
const targetKrw = 2_000_000_000;
const revenueEvidencePath = process.env.NOEMA_REVENUE_EVIDENCE_PATH
  || "artifacts/acquisition/revenue-evidence.json";
const transferEvidencePath = process.env.NOEMA_TRANSFER_EVIDENCE_PATH
  || "artifacts/acquisition/transfer-evidence.json";
const releasePublicationReceiptPath = process.env.NOEMA_RELEASE_PUBLICATION_RECEIPT_PATH
  || "artifacts/acquisition/release-publication-receipt.json";
const releaseUnderDiligenceTag = String(process.env.NOEMA_RELEASE_UNDER_DILIGENCE_TAG || "");
const pilotLogPath = process.env.NOEMA_PILOT_LOG_PATH
  || "docs/pilot-readiness-log.md";
const saleableEvidencePath = process.env.NOEMA_SALEABLE_AUDIT_PATH
  || latestSaleableAuditPath();
const dataRoomManifestPath = process.env.NOEMA_DATA_ROOM_MANIFEST_PATH
  || join(outputDir, "data-room-manifest.json");
const evidenceMaxAgeDays = parsePositiveNumber(
  process.env.NOEMA_ACQUISITION_EVIDENCE_MAX_AGE_DAYS,
  45,
  "NOEMA_ACQUISITION_EVIDENCE_MAX_AGE_DAYS",
);
const checks = [];

function latestSaleableAuditPath() {
  const root = "artifacts/saleable-readiness";
  if (!existsSync(root)) {
    return join(root, "latest", "goal-audit.json");
  }
  const latestDir = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{8}$/.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .at(-1);
  return latestDir
    ? join(root, latestDir, "goal-audit.json")
    : join(root, "latest", "goal-audit.json");
}

function record(name, pass, details = {}) {
  checks.push({ name, pass, details });
}

function parsePositiveNumber(raw, fallback, fieldName) {
  const value = Number(raw ?? fallback);
  if (!Number.isFinite(value) || value <= 0) {
    if (raw !== undefined) {
      console.error(`${fieldName} must be a positive finite number.`);
      process.exit(1);
    }
    return fallback;
  }
  return value;
}

function parseIsoDateOrTimestamp(value) {
  const match = isoDateOrTimestampRegex.exec(value);
  if (!match) return Number.NaN;

  const datePart = match[1];
  const calendarDate = new Date(`${datePart}T00:00:00.000Z`);
  if (Number.isNaN(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== datePart) {
    return Number.NaN;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function isDateOnlyIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function readJson(path) {
  const absolutePath = resolve(path);
  try {
    assertAcquisitionPrivatePathParents(absolutePath);
  } catch {
    return { ok: false, reason: "unsafe_or_unreadable", path };
  }

  const bytes = readStableFile(absolutePath, MAX_DATA_ROOM_JSON_BYTES);
  if (bytes === null) {
    return {
      ok: false,
      reason: existsSync(path) ? "unsafe_or_unreadable" : "missing",
      path,
    };
  }

  let text;
  try {
    text = fatalUtf8Decoder.decode(bytes);
  } catch {
    return { ok: false, reason: "invalid_utf8", path };
  }

  try {
    if (hasDuplicateJsonObjectKeys(text)) {
      return { ok: false, reason: "duplicate_json_key", path };
    }
    return { ok: true, path, value: JSON.parse(text) };
  } catch (error) {
    return { ok: false, reason: "invalid_json", path, error: error.message };
  }
}

function readText(path) {
  if (!existsSync(path)) {
    return { ok: false, reason: "missing", path };
  }
  try {
    return { ok: true, path, text: readFileSync(path, "utf8") };
  } catch (error) {
    return { ok: false, reason: "unreadable", path, error: error.message };
  }
}

function requireDoc(path, requiredText = []) {
  const doc = readText(path);
  if (!doc.ok) {
    record(`required acquisition artifact: ${path}`, false, doc);
    return;
  }
  const missingText = requiredText.filter((item) => !doc.text.includes(item));
  record(`required acquisition artifact: ${path}`, missingText.length === 0, {
    missingText,
  });
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonEmptyStringArray(value) {
  return Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString);
}

function isPlaceholderEvidence(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "placeholder"
    || normalized === "todo"
    || normalized === "tbd"
    || normalized.startsWith("replace-with-")
    || normalized.includes("docs/evidence-templates/")
    || normalized.endsWith(".example.json");
}

function validateEvidenceRefs(value, field) {
  if (!isNonEmptyStringArray(value)) {
    return { pass: false, failures: [`${field} must contain at least one path or system id`] };
  }
  const placeholders = value.filter(isPlaceholderEvidence);
  return {
    pass: placeholders.length === 0,
    failures: placeholders.length === 0
      ? []
      : [`${field} must reference reviewed evidence, not placeholders or templates`],
  };
}

function validateEvidenceMetadata(value) {
  const failures = [];
  const updatedAt = typeof value.updated_at === "string" ? value.updated_at : "";
  const updatedAtMs = parseIsoDateOrTimestamp(updatedAt);
  const nowMs = Date.now();
  const maxAgeMs = evidenceMaxAgeDays * 24 * 60 * 60 * 1000;
  const futureBoundaryMs = isDateOnlyIsoDate(updatedAt)
    ? nowMs + MAX_ISO_UTC_OFFSET_MS
    : nowMs;

  if (!isNonEmptyString(value.owner)) {
    failures.push("owner required");
  } else if (isPlaceholderEvidence(value.owner)) {
    failures.push("owner cannot be a placeholder");
  }
  const sourceDocuments = validateEvidenceRefs(value.source_documents, "source_documents");
  failures.push(...sourceDocuments.failures);
  if (!updatedAt || Number.isNaN(updatedAtMs)) {
    failures.push("updated_at must be an ISO date or timestamp");
  } else if (updatedAtMs > futureBoundaryMs) {
    failures.push("updated_at cannot be in the future");
  } else if (nowMs - updatedAtMs > maxAgeMs) {
    failures.push(`updated_at is older than ${evidenceMaxAgeDays} days`);
  }

  return {
    pass: failures.length === 0,
    failures,
  };
}

function validateRevenueMetrics(value) {
  const failures = [];
  const nonNegativeSafeIntegerFields = [
    "arr_krw",
    "paid_customers",
    "pipeline_weighted_krw",
    "loi_count",
  ];
  for (const field of nonNegativeSafeIntegerFields) {
    const metric = value[field];
    if (metric === undefined) continue;
    if (typeof metric !== "number" || !Number.isSafeInteger(metric) || metric < 0) {
      failures.push(`${field} must be a non-negative safe integer JSON number`);
    }
  }

  for (const field of ["gross_margin", "customer_concentration_top1"]) {
    const metric = value[field];
    if (metric === undefined) continue;
    if (typeof metric !== "number" || !Number.isFinite(metric) || metric < 0 || metric > 1) {
      failures.push(`${field} must be a finite JSON number from 0 through 1`);
    }
  }

  return { pass: failures.length === 0, failures };
}

function isCanonicalEvidencePath(value) {
  if (!isNonEmptyString(value) || value.includes("\\") || value.startsWith("/")) return false;
  if (/^[A-Za-z]:/.test(value) || value.includes("\0")) return false;
  const segments = value.split("/");
  return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function readStableRepositoryArtifact(path) {
  const absolutePath = resolve(process.cwd(), path);
  try {
    assertAcquisitionPrivatePathParents(absolutePath);
  } catch {
    return null;
  }
  return readStableFile(absolutePath, MAX_DATA_ROOM_EVIDENCE_BYTES);
}

function readDigestBoundArtifact(value, field, failures) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    failures.push(`${field} artifact binding required`);
    return null;
  }
  const pathValid = isCanonicalEvidencePath(value.path) && !isPlaceholderEvidence(value.path);
  const expectedDigest = String(value.sha256 ?? "");
  const digestValid = /^[0-9a-f]{64}$/i.test(expectedDigest);
  if (!pathValid) {
    failures.push(`${field}.path must be a canonical reviewed evidence path`);
  }
  if (!digestValid) {
    failures.push(`${field}.sha256 must be a SHA-256 digest`);
  }
  if (!pathValid || !digestValid) {
    return null;
  }

  const artifactBytes = readStableRepositoryArtifact(value.path);
  if (artifactBytes === null) {
    failures.push(`${field}.path must reference a stable bounded regular retained artifact`);
    return null;
  }
  const actualDigest = createHash("sha256").update(artifactBytes).digest("hex");
  if (actualDigest !== expectedDigest.toLowerCase()) {
    failures.push(`${field}.sha256 does not match retained artifact bytes`);
    return null;
  }
  return artifactBytes;
}

function validateDigestBoundArtifact(value, field, failures) {
  readDigestBoundArtifact(value, field, failures);
}

function validateArtifactRightsMetadata(value, release, decision, failures) {
  const field = "release_rights.artifact_rights_metadata";
  const artifactBytes = readDigestBoundArtifact(value, field, failures);
  if (artifactBytes === null) return;

  let artifactText;
  try {
    artifactText = fatalUtf8Decoder.decode(artifactBytes);
  } catch {
    failures.push(`${field} must contain valid UTF-8 JSON`);
    return;
  }

  let metadata;
  try {
    if (hasDuplicateJsonObjectKeys(artifactText)) {
      failures.push(`${field} must not contain duplicate JSON object keys`);
      return;
    }
    metadata = JSON.parse(artifactText);
  } catch {
    failures.push(`${field} must contain valid JSON`);
    return;
  }

  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    failures.push(`${field} must contain a JSON object`);
    return;
  }
  if (metadata.schema_version !== 1) {
    failures.push(`${field}.schema_version must be 1`);
  }
  if (metadata.repository !== "ContextualWisdomLab/noema") {
    failures.push(`${field}.repository must be ContextualWisdomLab/noema`);
  }
  if (metadata.tag !== release.tag) {
    failures.push(`${field}.tag must match release_rights.tag`);
  }
  if (metadata.commit_sha !== release.commit_sha) {
    failures.push(`${field}.commit_sha must match release_rights.commit_sha`);
  }

  const artifacts = Array.isArray(metadata.artifacts) ? metadata.artifacts : [];
  if (artifacts.length === 0) {
    failures.push(`${field}.artifacts must contain at least one reviewed release artifact`);
    return;
  }

  const artifactIdentities = new Set();
  for (const artifact of artifacts) {
    if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
      failures.push(`${field}.artifacts entries must be objects`);
      continue;
    }
    if (!isNonEmptyString(artifact.artifact_kind)) {
      failures.push(`${field}.artifacts[].artifact_kind required`);
    }
    if (!isNonEmptyString(artifact.artifact_identity)) {
      failures.push(`${field}.artifacts[].artifact_identity required`);
    } else if (artifactIdentities.has(artifact.artifact_identity)) {
      failures.push(`${field}.artifacts[].artifact_identity must be unique`);
    } else {
      artifactIdentities.add(artifact.artifact_identity);
    }

    if (artifact.artifact_kind !== "oci_image") continue;
    const annotations = artifact.oci_annotations;
    if (!annotations || typeof annotations !== "object" || Array.isArray(annotations)) {
      failures.push(`${field}.artifacts[].oci_annotations must be an object for OCI images`);
      continue;
    }
    const licenseClaim = annotations["org.opencontainers.image.licenses"];
    if (licenseClaim === undefined) continue;
    if (!isNonEmptyString(licenseClaim)) {
      failures.push("OCI license annotation must be a non-empty SPDX license expression when present");
      continue;
    }
    if (!decision || typeof decision !== "object" || Array.isArray(decision) || decision.type !== "spdx") {
      failures.push("custom or unlicensed rights decision forbids OCI license annotation claims");
      continue;
    }
    if (licenseClaim.trim() !== String(decision.license_expression ?? "").trim()) {
      failures.push("OCI license annotation must match the owner-approved SPDX expression exactly");
    }
  }
}

function validateLicensingIpEvidence(value) {
  const failures = [];
  const licensing = value?.licensing_ip;
  if (!licensing || typeof licensing !== "object" || Array.isArray(licensing)) {
    return { pass: false, failures: ["licensing_ip evidence object required"] };
  }

  const decision = licensing.owner_legal_decision;
  const decisionTypes = new Set(["spdx", "custom", "unlicensed"]);
  if (!decision || typeof decision !== "object" || Array.isArray(decision)) {
    failures.push("licensing_ip.owner_legal_decision required");
  } else {
    if (!decisionTypes.has(decision.type)) {
      failures.push("owner_legal_decision.type must be spdx, custom, or unlicensed");
    }
    const decisionEvidence = validateEvidenceRefs(
      decision.evidence,
      "licensing_ip.owner_legal_decision.evidence",
    );
    failures.push(...decisionEvidence.failures);
    if (decision.type === "spdx" && !isNonEmptyString(decision.license_expression)) {
      failures.push("owner_legal_decision.license_expression required for spdx decision");
    }
  }

  const rights = licensing.repository_rights;
  const allowedRightsPaths = new Set([
    "LICENSE",
    "LICENSE.md",
    "LICENSE.txt",
    "RIGHTS",
    "RIGHTS.md",
    "RIGHTS.txt",
    "COPYRIGHT",
    "COPYRIGHT.md",
    "COPYRIGHT.txt",
  ]);
  if (!rights || typeof rights !== "object" || Array.isArray(rights)) {
    failures.push("licensing_ip.repository_rights required");
  } else {
    if (!allowedRightsPaths.has(rights.path)) {
      failures.push("repository_rights.path must name a reviewed root license or rights notice");
    }
    if (!/^[0-9a-f]{64}$/i.test(String(rights.sha256 ?? ""))) {
      failures.push("repository_rights.sha256 must be a SHA-256 digest");
    }
    if (allowedRightsPaths.has(rights.path)) {
      const rightsBytes = readStableRepositoryArtifact(rights.path);
      if (rightsBytes === null) {
        failures.push(`repository rights file missing or unreadable: ${rights.path}`);
      } else {
        const actualDigest = createHash("sha256").update(rightsBytes).digest("hex");
        if (actualDigest !== String(rights.sha256 ?? "").toLowerCase()) {
          failures.push("repository_rights.sha256 does not match retained root rights bytes");
        }
      }
    }
  }

  const packageJson = readJson("package.json");
  const packageLicense = packageJson.ok && isNonEmptyString(packageJson.value?.license)
    ? packageJson.value.license.trim()
    : "";
  const declaredPackageLicense = isNonEmptyString(licensing.package_metadata?.license)
    ? licensing.package_metadata.license.trim()
    : "";
  if (!packageLicense) failures.push("package.json license field required");
  if (!declaredPackageLicense) {
    failures.push("licensing_ip.package_metadata.license required");
  } else if (packageLicense && declaredPackageLicense !== packageLicense) {
    failures.push("package_metadata.license must match package.json license exactly");
  }

  if (decision && typeof decision === "object" && !Array.isArray(decision)) {
    if (
      decision.type === "spdx"
      && isNonEmptyString(decision.license_expression)
      && packageLicense
      && packageLicense !== decision.license_expression.trim()
    ) {
      failures.push("package.json license must match the owner-approved SPDX expression");
    }
    if (
      decision.type === "custom"
      && rights
      && allowedRightsPaths.has(rights.path)
      && packageLicense
      && packageLicense !== `SEE LICENSE IN ${rights.path}`
    ) {
      failures.push("custom rights decision requires package.json SEE LICENSE IN metadata");
    }
    if (decision.type === "unlicensed" && packageLicense && packageLicense !== "UNLICENSED") {
      failures.push("unlicensed decision requires package.json license=UNLICENSED");
    }
  }

  const release = licensing.release_rights;
  if (!release || typeof release !== "object" || Array.isArray(release)) {
    failures.push("licensing_ip.release_rights required");
  } else {
    if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(String(release.tag ?? ""))) {
      failures.push("release_rights.tag must be a semantic-version tag");
    }
    if (releaseUnderDiligenceTag && release.tag !== releaseUnderDiligenceTag) {
      failures.push("release_rights.tag must match the release under diligence");
    }
    if (!/^[0-9a-f]{40}$/i.test(String(release.commit_sha ?? ""))) {
      failures.push("release_rights.commit_sha must be a full Git SHA");
    }
    validateDigestBoundArtifact(release.sbom, "release_rights.sbom", failures);
    validateDigestBoundArtifact(
      release.dependency_license_inventory,
      "release_rights.dependency_license_inventory",
      failures,
    );
    validateDigestBoundArtifact(release.notice, "release_rights.notice", failures);
    validateDigestBoundArtifact(release.provenance, "release_rights.provenance", failures);
    validateArtifactRightsMetadata(
      release.artifact_rights_metadata,
      release,
      decision,
      failures,
    );
  }

  const contributorIp = licensing.contributor_ip;
  if (!contributorIp || typeof contributorIp !== "object" || Array.isArray(contributorIp)) {
    failures.push("licensing_ip.contributor_ip required");
  } else {
    const ownershipEvidence = validateEvidenceRefs(
      contributorIp.ownership_evidence,
      "licensing_ip.contributor_ip.ownership_evidence",
    );
    const assignmentEvidence = validateEvidenceRefs(
      contributorIp.assignment_evidence,
      "licensing_ip.contributor_ip.assignment_evidence",
    );
    failures.push(...ownershipEvidence.failures, ...assignmentEvidence.failures);
  }

  return { pass: failures.length === 0, failures };
}

function validateReleasePublicationReceipt(value, expectedTag) {
  const failures = [];
  const expectedAssets = [
    "SHA256SUMS",
    "cyclonedx-sbom.sigstore.json",
    "noema.cdx.json",
    "provenance.sigstore.json",
    "release-evidence.json",
  ];
  if (value.schemaVersion !== 1) failures.push("schemaVersion must be 1");
  if (value.source?.repository !== "ContextualWisdomLab/noema") {
    failures.push("source.repository must be ContextualWisdomLab/noema");
  }
  if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(String(value.source?.tag ?? ""))) {
    failures.push("source.tag must be a semantic-version tag");
  }
  if (value.source?.tag !== expectedTag) {
    failures.push(`source.tag must match release under diligence ${expectedTag}`);
  }
  if (!/^[0-9a-f]{40}$/i.test(String(value.source?.commitSha ?? ""))) {
    failures.push("source.commitSha must be a full SHA");
  }
  if (value.source?.tag !== `v${value.source?.version ?? ""}`) {
    failures.push("source tag and version must match");
  }
  if (value.immutableReleasePolicy?.enabled !== true) {
    failures.push("immutable release policy must be enabled");
  }
  if (value.release?.immutable !== true) {
    failures.push("release must be immutable");
  }
  if (
    value.release?.tagName !== value.source?.tag
    || value.release?.resolvedTagCommitSha !== value.source?.commitSha
  ) {
    failures.push("release identity must match source tag and resolved tag commit");
  }
  if (
    value.verification?.releaseVerified !== true
    || value.verification?.resolvedTagCommitSha !== value.source?.commitSha
  ) {
    failures.push("release verification and resolved tag commit must pass");
  }
  if (!isNonEmptyString(value.verification?.workflowRunUrl)) {
    failures.push("verification workflowRunUrl required");
  }
  const assets = Array.isArray(value.assets) ? value.assets : [];
  const names = assets.map((asset) => String(asset?.name ?? "")).sort();
  const sourceAsset = `noema-${String(value.source?.commitSha ?? "")}.tar.gz`;
  const exactExpectedAssets = [...expectedAssets, sourceAsset].sort();
  if (JSON.stringify(names) !== JSON.stringify(exactExpectedAssets)) {
    failures.push("assets must contain the exact immutable release set");
  }
  const verifiedAssets = Array.isArray(value.verification?.verifiedAssets)
    ? value.verification.verifiedAssets.map(String).sort()
    : [];
  if (JSON.stringify(verifiedAssets) !== JSON.stringify(exactExpectedAssets)) {
    failures.push("every immutable release asset must be verified");
  }
  for (const asset of assets) {
    if (!/^[0-9a-f]{64}$/i.test(String(asset?.sha256 ?? ""))) {
      failures.push(`asset ${String(asset?.name ?? "unknown")} has invalid sha256`);
    }
    if (asset?.apiDigest !== `sha256:${asset?.sha256 ?? ""}`) {
      failures.push(`asset ${String(asset?.name ?? "unknown")} API digest mismatch`);
    }
    if (!Number.isSafeInteger(asset?.bytes) || asset.bytes <= 0) {
      failures.push(`asset ${String(asset?.name ?? "unknown")} byte size invalid`);
    }
  }
  return { pass: failures.length === 0, failures };
}

function isReportOnlyMode() {
  return process.env.NOEMA_AUDIT_REPORT_ONLY === "1";
}

const reportOnlyEvidenceGapNames = new Set([
  "pilot production evidence pass",
  "revenue evidence present",
  "revenue evidence supports 2B target",
  "transfer evidence present",
  "transfer evidence pass",
  "release publication receipt present",
  "release publication receipt pass",
  "saleable readiness evidence present",
  "saleable readiness pass",
  "data room manifest present",
  "data room manifest final gate pass",
]);

function isReportOnlyEvidenceGap(item) {
  return reportOnlyEvidenceGapNames.has(item.name);
}

function logFailedChecks(failedChecks) {
  console.log("Failed checks:");
  failedChecks.forEach((item) => {
    console.log(`- ${item.name}`);
    if (item.details && Object.keys(item.details).length > 0) {
      console.log(`  details=${JSON.stringify(item.details)}`);
    }
  });
}

assertAcquisitionPrivatePathParents(auditFile);
mkdirSync(outputDir, { recursive: true });

requireDoc("docs/acquisition-readiness-2b.md", [
  "NOEMA-GOAL-ACQUISITION-2B-2026-07-02",
  "KRW 2,000,000,000",
  "Revenue_PASS",
  "Transfer_PASS",
]);
requireDoc("docs/buyer-due-diligence-index.md", [
  "npm run acquisition:audit",
  "artifacts/acquisition/revenue-evidence.json",
  "artifacts/acquisition/transfer-evidence.json",
]);
requireDoc("docs/library-boundary-decision.md", [
  "현재는 submodule을 만들지 않는다",
  "npm workspaces",
  "Split Triggers",
]);
requireDoc("scripts/acquisition-data-room-manifest.mjs", [
  "finalGatePassed",
  "data-room-manifest.json",
  "release-publication-receipt",
]);
requireDoc("docs/saleable-program-goal-registry.md", [
  "NOEMA-GOAL-SALEABLE-2026-07-02",
]);
requireDoc("docs/pricing-draft.md");
requireDoc("docs/terms-draft.md");
requireDoc("docs/sla-and-support.md");

const pilotLog = readText(pilotLogPath);
if (!pilotLog.ok) {
  record("pilot production evidence pass", false, pilotLog);
} else {
  const pilotEvaluation = evaluatePilotReadinessText(pilotLog.text);
  record("pilot production evidence pass", pilotEvaluation.passed, {
    path: pilotLogPath,
    requiredFor: "Saleable_PASS and Buyer_DD_PASS",
    entries: pilotEvaluation.entries,
  });
}

const revenue = readJson(revenueEvidencePath);
if (!revenue.ok) {
  record("revenue evidence present", false, revenue);
} else {
  const value = revenue.value;
  const metadata = validateEvidenceMetadata(value);
  const metrics = validateRevenueMetrics(value);
  const qnaEvidence = validateEvidenceRefs(value.buyer_due_diligence_qna, "buyer_due_diligence_qna");
  const arrRoute = metrics.pass
    && Number.isSafeInteger(value.arr_krw)
    && value.arr_krw >= 300_000_000
    && typeof value.gross_margin === "number"
    && Number.isFinite(value.gross_margin)
    && value.gross_margin >= 0.7
    && Number.isSafeInteger(value.paid_customers)
    && value.paid_customers >= 3
    && typeof value.customer_concentration_top1 === "number"
    && Number.isFinite(value.customer_concentration_top1)
    && value.customer_concentration_top1 >= 0
    && value.customer_concentration_top1 < 0.6;
  const pipelineRoute = metrics.pass
    && Number.isSafeInteger(value.pipeline_weighted_krw)
    && value.pipeline_weighted_krw >= 500_000_000
    && Number.isSafeInteger(value.loi_count)
    && value.loi_count >= 3
    && Number.isSafeInteger(value.paid_customers)
    && value.paid_customers >= 1
    && qnaEvidence.pass;
  record("revenue evidence supports 2B target", (arrRoute || pipelineRoute) && metadata.pass && metrics.pass, {
    path: revenueEvidencePath,
    targetKrw,
    route: arrRoute ? "ARR" : pipelineRoute ? "strategic_pipeline" : "none",
    metadataFailures: metadata.failures,
    metricFailures: metrics.failures,
    buyerQnaFailures: qnaEvidence.failures,
    arr_krw: value.arr_krw,
    gross_margin: value.gross_margin,
    paid_customers: value.paid_customers,
    pipeline_weighted_krw: value.pipeline_weighted_krw,
    loi_count: value.loi_count,
    buyer_due_diligence_qna: value.buyer_due_diligence_qna,
    customer_concentration_top1: value.customer_concentration_top1,
    updated_at: value.updated_at,
    owner: value.owner,
    source_documents: value.source_documents,
  });
}

const transfer = readJson(transferEvidencePath);
if (!transfer.ok) {
  record("transfer evidence present", false, transfer);
} else {
  const metadata = validateEvidenceMetadata(transfer.value);
  const licensingIp = validateLicensingIpEvidence(transfer.value);
  const required = [
    "license_review",
    "third_party_review",
    "github_app_transfer_plan",
    "cloudflare_transfer_plan",
    "secrets_rotation_plan",
    "owner_transfer_plan",
    "privacy_review",
  ];
  const failing = required.filter((key) => transfer.value[key] !== "pass");
  record("transfer evidence pass", failing.length === 0 && metadata.pass && licensingIp.pass, {
    path: transferEvidencePath,
    failing,
    metadataFailures: metadata.failures,
    licensingIpFailures: licensingIp.failures,
    updated_at: transfer.value.updated_at,
    owner: transfer.value.owner,
    source_documents: transfer.value.source_documents,
  });
}

if (!releaseUnderDiligenceTag) {
  const details = {
    required: false,
    reason: "NOEMA_RELEASE_UNDER_DILIGENCE_TAG is not selected",
    path: releasePublicationReceiptPath,
  };
  record("release publication receipt present", true, details);
  record("release publication receipt pass", true, details);
} else {
  const releasePublication = readJson(releasePublicationReceiptPath);
  record("release publication receipt present", releasePublication.ok, releasePublication.ok
    ? { path: releasePublicationReceiptPath, releaseUnderDiligenceTag }
    : releasePublication);
  if (releasePublication.ok) {
    const evaluation = validateReleasePublicationReceipt(
      releasePublication.value,
      releaseUnderDiligenceTag,
    );
    record("release publication receipt pass", evaluation.pass, {
      path: releasePublicationReceiptPath,
      releaseUnderDiligenceTag,
      failures: evaluation.failures,
      source: releasePublication.value.source,
      release: releasePublication.value.release,
      workflowRunUrl: releasePublication.value.verification?.workflowRunUrl,
    });
  }
}

const saleable = readJson(saleableEvidencePath);
if (!saleable.ok) {
  record("saleable readiness evidence present", false, saleable);
} else {
  record("saleable readiness pass", saleable.value.passed === true, {
    path: saleableEvidencePath,
    passed: saleable.value.passed,
    objective: saleable.value.objective,
  });
}

const dataRoom = readJson(dataRoomManifestPath);
if (!dataRoom.ok) {
  record("data room manifest present", false, dataRoom);
} else {
  record("data room manifest final gate pass", dataRoom.value.finalGatePassed === true && dataRoom.value.objective === objective, {
    path: dataRoomManifestPath,
    objective: dataRoom.value.objective,
    expectedObjective: objective,
    passed: dataRoom.value.passed,
    finalGatePassed: dataRoom.value.finalGatePassed,
    missingFinalGate: dataRoom.value.missingFinalGate,
  });
}

const failed = checks.filter((item) => !item.pass);
const reportOnly = isReportOnlyMode();
const reportOnlyHardFailures = reportOnly
  ? failed.filter((item) => !isReportOnlyEvidenceGap(item))
  : failed;
const reportOnlyCanPass = reportOnly && reportOnlyHardFailures.length === 0;
const status = failed.length === 0 ? "PASS" : reportOnlyCanPass ? "NOT_READY" : "FAIL";
const output = {
  generatedAt: now,
  objective,
  targetKrw,
  evidenceMaxAgeDays,
  passed: failed.length === 0,
  status,
  reportOnly,
  revenueEvidencePath,
  transferEvidencePath,
  releasePublicationReceiptPath,
  releaseUnderDiligenceTag,
  pilotLogPath,
  saleableEvidencePath,
  dataRoomManifestPath,
  reportOnlyHardFailures: reportOnlyHardFailures.map((item) => item.name),
  checks,
};

writeAcquisitionPrivateFile(auditFile, JSON.stringify(output, null, 2));
console.log(`acquisition-readiness-audit: ${status}`);
console.log(`audit_file=${auditFile}`);

if (!output.passed) {
  logFailedChecks(failed);
  if (reportOnlyCanPass) {
    console.log("::warning::Scheduled acquisition audit recorded NOT_READY external evidence gaps without failing CI.");
    console.log("report_only=true: external production/commercial evidence is not ready; scheduled audit recorded NOT_READY without failing CI.");
  } else {
    if (reportOnly) {
      console.log("report_only=true: hard failures remain; scheduled audit failed CI.");
    }
    process.exit(1);
  }
}
