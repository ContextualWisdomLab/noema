import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
} from "node:fs";
import { isAbsolute, posix, relative, resolve, sep } from "node:path";
import { hasDuplicateJsonObjectKeys } from "../normalize-commercial-readiness-evidence.mjs";

/** Stable schema identifier for buyer data-room manifests. */
export const DATA_ROOM_SCHEMA_VERSION = 1;
/** Repository identity bound into every trusted data-room manifest and external receipt. */
export const DATA_ROOM_REPOSITORY = "ContextualWisdomLab/noema";
/** Acquisition objective whose evidence this manifest indexes. */
export const DATA_ROOM_OBJECTIVE = "NOEMA-GOAL-ACQUISITION-2B-2026-07-02";
/** Maximum accepted manifest or external receipt size. */
export const MAX_DATA_ROOM_JSON_BYTES = 2 * 1024 * 1024;
/** Maximum accepted individual retained evidence file size. */
export const MAX_DATA_ROOM_EVIDENCE_BYTES = 32 * 1024 * 1024;
const MAX_ENTRY_COUNT = 256;
const MAX_RELATIVE_PATH_BYTES = 1024;
const fullShaPattern = /^[0-9a-f]{40}$/i;
const sha256Pattern = /^[0-9a-f]{64}$/i;
const canonicalTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const unsafeControlPattern = /[\u0000-\u001f\u007f]/;
const fatalUtf8Decoder = new TextDecoder("utf-8", { fatal: true });
const defaultFileSystem = Object.freeze({
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
});

function file(id, category, path, extra = {}) {
  return Object.freeze({
    ...extra,
    id,
    category,
    kind: "file",
    path,
    required: true,
    requiredForFinalGate: true,
  });
}

function command(id, category, commandText) {
  return Object.freeze({
    id,
    category,
    kind: "command",
    command: commandText,
    required: true,
    requiredForFinalGate: true,
  });
}

function external(id, category, url, receiptPath, artifactPath) {
  return Object.freeze({
    id,
    category,
    kind: "external",
    url,
    receiptPath,
    artifactPath,
    required: false,
    requiredForFinalGate: true,
    statusMeaning: "declared URL is non-verifying metadata; final-gate use requires a verified immutable local receipt",
  });
}

function finalEvidence(id, category, path, validatedBy = "npm run acquisition:audit") {
  return Object.freeze({
    id,
    category,
    kind: "file",
    path,
    required: false,
    requiredForFinalGate: true,
    validatedBy,
    statusMeaning: "file presence only; validator must pass before buyer use",
  });
}

/**
 * Reviewed acquisition data-room catalog. The integrity verifier requires the
 * manifest entry set and each immutable entry identity to match this catalog;
 * callers cannot add a convenient evidence path or command at audit time.
 */
export const DATA_ROOM_CATALOG = Object.freeze([
  file("product-readme", "product", "README.md"),
  file("api-spec", "product", "docs/api-spec.md"),
  file("api-stability-contract", "product", "docs/api-stability-contract.md"),
  file("demo-scenario", "product", "docs/demo-scenario.md"),
  file("buyer-pitch-outline", "product", "docs/buyer-pitch-deck-outline.md"),
  file("onboarding", "product", "docs/onboarding.md"),
  file("pricing", "commercial", "docs/pricing-draft.md"),
  file("terms", "commercial", "docs/terms-draft.md"),
  file("sla-support", "commercial", "docs/sla-and-support.md"),
  file("runbook", "operations", "docs/runbook.md"),
  file("deployment-guide", "operations", "docs/deployment-guide.md"),
  file("deployment-provenance", "operations", "docs/deployment-provenance.md"),
  file("observability-kpi", "operations", "docs/observability-kpi.md"),
  file("release-supply-chain", "security", "docs/release-supply-chain.md"),
  file("security-checklist", "security", "docs/security-validation-checklist.md"),
  file("threat-model", "security", "docs/threat-model.md"),
  file("transfer-readiness-plan", "transfer", "docs/transfer-readiness-plan.md"),
  file("saleable-goal", "governance", "docs/saleable-program-goal-registry.md"),
  file("saleable-readiness", "governance", "docs/saleable-program-readiness.md"),
  file("acquisition-goal", "governance", "docs/acquisition-readiness-2b.md"),
  file("buyer-dd-index", "governance", "docs/buyer-due-diligence-index.md"),
  file("library-boundary", "governance", "docs/library-boundary-decision.md"),
  file("revenue-evidence-template", "commercial", "docs/evidence-templates/revenue-evidence.example.json"),
  file("transfer-evidence-template", "transfer", "docs/evidence-templates/transfer-evidence.example.json"),
  file("pilot-checklist", "pilot", "docs/pilot-readiness-checklist.md"),
  file("pilot-log", "pilot", "docs/pilot-readiness-log.md", {
    validatedBy: "npm run acquisition:audit",
    statusMeaning: "file presence only; production pilot content is validated by acquisition:audit",
  }),
  file("release-audit", "governance", "docs/release-readiness-audit.md"),
  file("goal-completion-audit", "governance", "docs/goal-completion-audit.md"),
  file("release-gate-script", "automation", "scripts/saleable-readiness-audit.mjs"),
  file("release-evidence-script", "automation", "scripts/release-evidence.mjs"),
  file("release-publication-receipt-script", "automation", "scripts/release-publication-receipt.mjs"),
  file("deployment-evidence-script", "automation", "scripts/deployment-evidence.mjs"),
  file("deployment-evidence-audit", "automation", "scripts/acquisition-deployment-evidence-audit.mjs"),
  file("deployment-evidence-evaluator", "automation", "scripts/lib/acquisition-deployment-evidence.mjs"),
  file("production-governance-audit", "automation", "scripts/production-environment-governance-audit.mjs"),
  file("production-governance-evaluator", "automation", "scripts/lib/production-environment-governance.mjs"),
  file("production-deployment-workflow", "automation", ".github/workflows/cd.yml"),
  file("release-evidence-workflow", "automation", ".github/workflows/release-evidence.yml"),
  file("release-evidence-tests", "automation", "test/release-evidence.test.ts"),
  file("immutable-release-publication-tests", "automation", "test/immutable-release-publication.test.ts"),
  file("deployment-evidence-tests", "automation", "test/deployment-evidence.test.ts"),
  file("acquisition-deployment-evidence-tests", "automation", "test/acquisition-deployment-evidence.test.ts"),
  file("production-governance-tests", "automation", "test/production-environment-governance.test.ts"),
  file("acquisition-gate-script", "automation", "scripts/acquisition-readiness-audit.mjs"),
  file("production-preflight-script", "automation", "scripts/production-evidence-preflight.mjs"),
  file("acquisition-scan-workflow", "automation", ".github/workflows/acquisition-readiness-scan.yml"),
  file("pilot-parser", "automation", "scripts/lib/pilot-readiness.mjs"),
  file("security-checklist-parser", "automation", "scripts/lib/security-checklist.mjs"),
  file("source-id-helper", "automation", "scripts/lib/source-id.mjs"),
  file("security-evidence-template", "security", "docs/evidence-templates/security-validation-evidence.example.json"),
  file("security-evidence-validator", "security", "scripts/security-validation-evidence.mjs"),
  command("release-evidence-build", "automation", "npm run release:evidence -- --source <archive> --sbom <sbom> --output-dir <directory>"),
  command("release-publication-receipt-verify", "automation", "npm run release:publication-receipt -- --policy <policy> --release-view <view> --release-api <api> --verification <verification> --release-evidence <manifest> --asset-dir <directory> --output <receipt>"),
  command("release-verify", "automation", "npm run release:verify"),
  command("deployment-evidence-verify", "automation", "NOEMA_RELEASE_UNDER_DILIGENCE_TAG=<tag> npm run acquisition:deployment-evidence"),
  command("deployment-attestation-verify", "security", "gh attestation verify deployment-evidence.json --bundle deployment-evidence.sigstore.json --repo ContextualWisdomLab/noema --signer-workflow ContextualWisdomLab/noema/.github/workflows/cd.yml --cert-oidc-issuer https://token.actions.githubusercontent.com --predicate-type https://contextualwisdomlab.org/attestations/noema-deployment/v1 --deny-self-hosted-runners"),
  command("security-evidence-verify", "security", "npm run security:evidence"),
  command("readiness-audit", "automation", "npm run readiness:audit"),
  command("acquisition-audit", "automation", "npm run acquisition:audit"),
  external(
    "figjam-value-map",
    "product",
    "https://www.figma.com/board/8l2fELfENAABNhDTMEVJKt",
    "artifacts/acquisition/figjam-value-map-verification.json",
    "artifacts/acquisition/figjam-value-map-export.json",
  ),
  finalEvidence("production-kpi-log", "operations", "exchange-30d.ndjson"),
  finalEvidence("production-kpi-provenance", "operations", "exchange-30d.ndjson.provenance.json"),
  finalEvidence("security-validation-evidence", "security", "artifacts/security/security-validation-evidence.json", "npm run security:evidence"),
  finalEvidence("release-publication-receipt", "security", "artifacts/acquisition/release-publication-receipt.json"),
  finalEvidence("production-deployment-evidence", "operations", "artifacts/acquisition/deployment-evidence.json"),
  finalEvidence("production-deployment-attestation", "security", "artifacts/acquisition/deployment-evidence.sigstore.json"),
  finalEvidence("deployment-attestation-verification", "security", "artifacts/acquisition/deployment-attestation-verification.json"),
  finalEvidence("production-environment-governance", "governance", "artifacts/acquisition/production-environment-governance.json"),
  finalEvidence("revenue-evidence", "commercial", "artifacts/acquisition/revenue-evidence.json"),
  finalEvidence("transfer-evidence", "transfer", "artifacts/acquisition/transfer-evidence.json"),
]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSafeRegularMetadata(metadata, maximumBytes) {
  return Boolean(
    metadata
      && typeof metadata.isFile === "function"
      && typeof metadata.isSymbolicLink === "function"
      && metadata.isFile()
      && !metadata.isSymbolicLink()
      && Number.isSafeInteger(metadata.size)
      && metadata.size >= 0
      && metadata.size <= maximumBytes,
  );
}

function sameIdentity(left, right) {
  return Boolean(
    left
      && right
      && left.dev === right.dev
      && left.ino === right.ino
      && left.size === right.size
      && left.mtimeMs === right.mtimeMs
      && left.ctimeMs === right.ctimeMs,
  );
}

/**
 * Read a bounded regular file through O_NOFOLLOW and require path/descriptor
 * identity to remain stable before and after the complete read. The returned
 * bytes are suitable for hashing or fatal UTF-8 decoding; unsafe evidence is
 * represented as null rather than partially trusted data.
 */
export function readStableFile(path, maximumBytes = MAX_DATA_ROOM_EVIDENCE_BYTES, fileSystem = defaultFileSystem) {
  let descriptor = null;
  try {
    if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0) {
      return null;
    }
    const before = fileSystem.lstatSync(path);
    if (!isSafeRegularMetadata(before, maximumBytes)) {
      return null;
    }
    const readOnly = fileSystem.constants?.O_RDONLY;
    const noFollow = fileSystem.constants?.O_NOFOLLOW;
    if (!Number.isInteger(readOnly) || !Number.isInteger(noFollow)) {
      return null;
    }
    descriptor = fileSystem.openSync(path, readOnly | noFollow);
    const opened = fileSystem.fstatSync(descriptor);
    if (!isSafeRegularMetadata(opened, maximumBytes) || !sameIdentity(before, opened)) {
      return null;
    }
    const bytes = Buffer.allocUnsafe(opened.size);
    let offset = 0;
    while (offset < bytes.byteLength) {
      const count = fileSystem.readSync(
        descriptor,
        bytes,
        offset,
        bytes.byteLength - offset,
        null,
      );
      if (!Number.isSafeInteger(count) || count <= 0) {
        return null;
      }
      offset += count;
    }
    const afterDescriptor = fileSystem.fstatSync(descriptor);
    const afterPath = fileSystem.lstatSync(path);
    if (!sameIdentity(opened, afterDescriptor) || !sameIdentity(opened, afterPath)) {
      return null;
    }
    return bytes;
  } catch {
    return null;
  } finally {
    if (descriptor !== null) {
      try {
        fileSystem.closeSync(descriptor);
      } catch {
        // A failed close cannot make evidence more trustworthy; the read result
        // is already bounded and callers remain fail-closed on validation.
      }
    }
  }
}

function canonicalRelativePath(rootDir, candidate) {
  if (typeof candidate !== "string" || candidate.length === 0) {
    return null;
  }
  if (Buffer.byteLength(candidate, "utf8") > MAX_RELATIVE_PATH_BYTES) {
    return null;
  }
  if (unsafeControlPattern.test(candidate) || candidate.includes("\\") || isAbsolute(candidate)) {
    return null;
  }
  const components = candidate.split("/");
  if (components.some((component) => component === "" || component === "." || component === "..")) {
    return null;
  }
  if (posix.normalize(candidate) !== candidate) {
    return null;
  }
  const root = resolve(rootDir);
  const absolute = resolve(root, candidate);
  const rel = relative(root, absolute);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    return null;
  }
  return absolute;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function inspectFile(rootDir, path, maximumBytes, fileSystem) {
  const absolute = canonicalRelativePath(rootDir, path);
  if (!absolute) {
    return { present: false, unsafe: true, bytes: null };
  }
  try {
    fileSystem.lstatSync(absolute);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { present: false, unsafe: false, bytes: null };
    }
    return { present: false, unsafe: true, bytes: null };
  }
  const bytes = readStableFile(absolute, maximumBytes, fileSystem);
  if (!bytes) {
    return { present: false, unsafe: true, bytes: null };
  }
  return { present: true, unsafe: false, bytes };
}

function parseStableJson(path, maximumBytes, fileSystem) {
  const bytes = readStableFile(path, maximumBytes, fileSystem);
  if (!bytes) {
    return null;
  }
  try {
    const text = fatalUtf8Decoder.decode(bytes);
    if (hasDuplicateJsonObjectKeys(text)) {
      return null;
    }
    const value = JSON.parse(text);
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function boundedText(value, maximum = 4096) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maximum
    && !unsafeControlPattern.test(value);
}

function canonicalTimestamp(value) {
  if (typeof value !== "string" || !canonicalTimestampPattern.test(value)) {
    return false;
  }
  const milliseconds = Date.parse(value);
  return !Number.isNaN(milliseconds) && new Date(milliseconds).toISOString() === value;
}

function expectedIdentityMatches(entry, expected) {
  const keys = [
    "id",
    "category",
    "kind",
    "required",
    "requiredForFinalGate",
    "path",
    "command",
    "url",
    "receiptPath",
    "artifactPath",
    "validatedBy",
    "statusMeaning",
  ];
  return keys.every((key) => entry[key] === expected[key]);
}

function sameStringArray(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

function verifyExternalReceipt(expected, rootDir, expectedCommitSha, fileSystem) {
  const receiptAbsolute = canonicalRelativePath(rootDir, expected.receiptPath);
  if (!receiptAbsolute) {
    return { verified: false, missing: false, failure: `${expected.id} receipt path is not canonical` };
  }
  const reviewedArtifactAbsolute = canonicalRelativePath(rootDir, expected.artifactPath);
  if (!reviewedArtifactAbsolute) {
    return { verified: false, missing: false, failure: `${expected.id} reviewed retained artifact path is not canonical` };
  }
  try {
    fileSystem.lstatSync(receiptAbsolute);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { verified: false, missing: true, failure: null };
    }
    return { verified: false, missing: false, failure: `${expected.id} receipt is unreadable or unsafe` };
  }
  const receipt = parseStableJson(receiptAbsolute, MAX_DATA_ROOM_JSON_BYTES, fileSystem);
  if (!receipt) {
    return { verified: false, missing: false, failure: `${expected.id} receipt is malformed, ambiguous, oversized, or unsafe` };
  }
  const artifact = isRecord(receipt.artifact) ? receipt.artifact : null;
  if (!artifact || artifact.path !== expected.artifactPath) {
    return {
      verified: false,
      missing: false,
      failure: `${expected.id} receipt does not authenticate the reviewed retained artifact path`,
    };
  }
  const retained = inspectFile(rootDir, expected.artifactPath, MAX_DATA_ROOM_EVIDENCE_BYTES, fileSystem);
  const receiptValid = receipt.schemaVersion === 1
    && receipt.repository === DATA_ROOM_REPOSITORY
    && receipt.source?.commitSha === expectedCommitSha
    && receipt.sourceUrl === expected.url
    && canonicalTimestamp(receipt.collectedAt)
    && boundedText(receipt.collector, 256)
    && boundedText(receipt.provenance)
    && retained.present
    && !retained.unsafe
    && Number.isSafeInteger(artifact.bytes)
    && artifact.bytes > 0
    && artifact.bytes === retained.bytes.byteLength
    && sha256Pattern.test(String(artifact.sha256 ?? ""))
    && artifact.sha256 === sha256(retained.bytes);
  return receiptValid
    ? { verified: true, missing: false, failure: null }
    : { verified: false, missing: false, failure: `${expected.id} receipt does not authenticate the retained external artifact` };
}

function invalidResult(failure) {
  return {
    integrityPassed: false,
    recomputedPassed: false,
    finalGatePassed: false,
    missingRequired: [],
    missingFinalGate: [],
    failures: [failure],
  };
}

/**
 * Recompute acquisition data-room integrity from retained bytes and the
 * reviewed catalog. Persisted pass booleans and gap lists are cross-checks,
 * never authorization inputs. A bare network URL cannot satisfy a final gate.
 */
export function verifyDataRoomManifest(
  manifest,
  {
    rootDir = process.cwd(),
    expectedCommitSha,
    expectedReleaseTag = "",
    expectedReleaseCommitSha = "",
    catalog = DATA_ROOM_CATALOG,
    fileSystem = defaultFileSystem,
  } = {},
) {
  const failures = [];
  const missingRequired = [];
  const missingFinalGate = [];
  if (!isRecord(manifest)) {
    return invalidResult("manifest must be a JSON object");
  }
  if (manifest.schemaVersion !== DATA_ROOM_SCHEMA_VERSION) {
    failures.push("schemaVersion must match the reviewed data-room schema");
  }
  if (manifest.repository !== DATA_ROOM_REPOSITORY) {
    failures.push(`repository must match ${DATA_ROOM_REPOSITORY}`);
  }
  if (manifest.objective !== DATA_ROOM_OBJECTIVE) {
    failures.push("objective must match the acquisition-readiness objective");
  }
  if (!fullShaPattern.test(String(expectedCommitSha ?? "")) || manifest.source?.commitSha !== expectedCommitSha) {
    failures.push("source.commitSha must match the exact audited commit");
  }
  if (expectedReleaseTag || expectedReleaseCommitSha) {
    const releaseBound = boundedText(expectedReleaseTag, 256)
      && fullShaPattern.test(String(expectedReleaseCommitSha ?? ""))
      && manifest.release?.tag === expectedReleaseTag
      && manifest.release?.commitSha === expectedReleaseCommitSha;
    if (!releaseBound) {
      failures.push("release identity must match the selected immutable release");
    }
  } else if (manifest.release !== undefined && manifest.release !== null) {
    failures.push("release identity must be absent when no immutable release is selected");
  }

  if (!Array.isArray(catalog) || catalog.length === 0 || catalog.length > MAX_ENTRY_COUNT) {
    return invalidResult("reviewed catalog must be a bounded non-empty array");
  }
  const entries = Array.isArray(manifest.entries) ? manifest.entries : [];
  const safeCatalog = catalog;
  const ids = entries.map((entry) => entry?.id);
  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length) {
    failures.push("manifest entry ids must be unique");
  }
  const expectedIds = safeCatalog.map((entry) => entry.id);
  if (
    entries.length !== safeCatalog.length
    || expectedIds.some((id) => !uniqueIds.has(id))
    || ids.some((id) => !expectedIds.includes(id))
  ) {
    failures.push("manifest entry set must exactly match the reviewed catalog");
  }

  const expectedById = new Map(safeCatalog.map((entry) => [entry.id, entry]));
  for (const entry of entries) {
    if (!isRecord(entry) || typeof entry.id !== "string") {
      failures.push("manifest entries must be objects with reviewed ids");
      continue;
    }
    const expected = expectedById.get(entry.id);
    if (!expected) {
      continue;
    }
    if (!expectedIdentityMatches(entry, expected)) {
      failures.push(`${entry.id} immutable catalog identity does not match policy`);
      continue;
    }

    let present = false;
    if (expected.kind === "file") {
      const inspected = inspectFile(rootDir, expected.path, MAX_DATA_ROOM_EVIDENCE_BYTES, fileSystem);
      if (inspected.unsafe) {
        failures.push(`${entry.id} file is missing, unsafe, non-regular, or exceeds the evidence limit`);
      } else if (inspected.present) {
        present = true;
        const digest = sha256(inspected.bytes);
        if (
          entry.status !== "present"
          || entry.bytes !== inspected.bytes.byteLength
          || entry.sha256 !== digest
        ) {
          failures.push(`${entry.id} file digest or byte size does not match retained evidence`);
        }
      } else if (entry.status !== "missing" || entry.bytes !== null || entry.sha256 !== null) {
        failures.push(`${entry.id} persisted file status does not match retained evidence`);
      }
    } else if (expected.kind === "command") {
      present = true;
      if (entry.status !== "present") {
        failures.push(`${entry.id} command status does not match the reviewed catalog`);
      }
    } else if (expected.kind === "external") {
      const receipt = verifyExternalReceipt(expected, rootDir, expectedCommitSha, fileSystem);
      present = receipt.verified;
      if (receipt.failure) {
        failures.push(receipt.failure);
      }
      const expectedStatus = receipt.verified ? "present" : "declared";
      if (entry.status !== expectedStatus || entry.receiptVerified !== receipt.verified) {
        failures.push(`${entry.id} persisted external status does not match trusted receipt verification`);
      }
    } else {
      failures.push(`${entry.id} has an unsupported catalog kind`);
    }

    if (expected.required && !present) {
      missingRequired.push(entry.id);
    }
    if (expected.requiredForFinalGate && !present) {
      missingFinalGate.push(entry.id);
    }
  }

  for (const expected of safeCatalog) {
    if (!uniqueIds.has(expected.id)) {
      if (expected.required) {
        missingRequired.push(expected.id);
      }
      if (expected.requiredForFinalGate) {
        missingFinalGate.push(expected.id);
      }
    }
  }

  const dedupedMissingRequired = [...new Set(missingRequired)];
  const dedupedMissingFinalGate = [...new Set(missingFinalGate)];
  const recomputedPassed = dedupedMissingRequired.length === 0;
  const recomputedFinalGatePassed = dedupedMissingFinalGate.length === 0;
  if (manifest.passed !== recomputedPassed) {
    failures.push("persisted passed value contradicts trusted recomputation");
  }
  if (manifest.finalGatePassed !== recomputedFinalGatePassed) {
    failures.push("persisted finalGatePassed value contradicts trusted recomputation");
  }
  if (!sameStringArray(manifest.missingRequired, dedupedMissingRequired)) {
    failures.push("persisted missingRequired list contradicts trusted recomputation");
  }
  if (!sameStringArray(manifest.missingFinalGate, dedupedMissingFinalGate)) {
    failures.push("persisted missingFinalGate list contradicts trusted recomputation");
  }

  const integrityPassed = failures.length === 0;
  return {
    integrityPassed,
    recomputedPassed,
    finalGatePassed: integrityPassed && recomputedFinalGatePassed,
    missingRequired: dedupedMissingRequired,
    missingFinalGate: dedupedMissingFinalGate,
    failures,
  };
}

/**
 * Read and verify a retained data-room manifest using a bounded no-follow file
 * descriptor. Duplicate JSON keys, malformed UTF-8, path replacement, and
 * oversized input fail before persisted claims can influence readiness.
 */
export function verifyDataRoomManifestFile(path, options = {}) {
  const manifest = parseStableJson(
    path,
    MAX_DATA_ROOM_JSON_BYTES,
    options.fileSystem ?? defaultFileSystem,
  );
  if (!manifest) {
    return invalidResult("manifest JSON is missing, unsafe, malformed, oversized, or contains duplicate object keys");
  }
  return verifyDataRoomManifest(manifest, options);
}

/**
 * Materialize the reviewed catalog from the current retained bytes. The output
 * is descriptive evidence only; the independent verifier must recompute it
 * before acquisition readiness can rely on any status or digest.
 */
export function materializeDataRoomManifest({
  rootDir = process.cwd(),
  manifestPath,
  commitSha,
  releaseTag = "",
  releaseCommitSha = "",
  generatedAt = new Date().toISOString(),
  catalog = DATA_ROOM_CATALOG,
  fileSystem = defaultFileSystem,
} = {}) {
  if (!fullShaPattern.test(String(commitSha ?? ""))) {
    throw new TypeError("commitSha must be the exact 40-character audited Git commit");
  }
  const entries = catalog.map((expected) => {
    if (expected.kind === "file") {
      const inspected = inspectFile(rootDir, expected.path, MAX_DATA_ROOM_EVIDENCE_BYTES, fileSystem);
      if (inspected.present && !inspected.unsafe) {
        return {
          ...expected,
          status: "present",
          bytes: inspected.bytes.byteLength,
          sha256: sha256(inspected.bytes),
        };
      }
      return {
        ...expected,
        status: inspected.unsafe ? "unsafe" : "missing",
        bytes: null,
        sha256: null,
      };
    }
    if (expected.kind === "external") {
      const receipt = verifyExternalReceipt(expected, rootDir, commitSha, fileSystem);
      return {
        ...expected,
        status: receipt.verified ? "present" : receipt.failure ? "unsafe" : "declared",
        receiptVerified: receipt.verified,
      };
    }
    return { ...expected, status: "present" };
  });
  const missingRequired = entries
    .filter((entry) => entry.required && entry.status !== "present")
    .map((entry) => entry.id);
  const missingFinalGate = entries
    .filter((entry) => entry.requiredForFinalGate && entry.status !== "present")
    .map((entry) => entry.id);
  const output = {
    schemaVersion: DATA_ROOM_SCHEMA_VERSION,
    repository: DATA_ROOM_REPOSITORY,
    generatedAt,
    objective: DATA_ROOM_OBJECTIVE,
    manifestPath,
    source: { commitSha },
    ...(releaseTag || releaseCommitSha
      ? { release: { tag: releaseTag, commitSha: releaseCommitSha } }
      : {}),
    passed: missingRequired.length === 0,
    finalGatePassed: missingFinalGate.length === 0,
    missingRequired,
    missingFinalGate,
    entries,
  };
  return output;
}
