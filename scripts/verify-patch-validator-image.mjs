#!/usr/bin/env node

import {
  MAX_RECEIPT_BYTES,
  readBoundedJson,
  verifyPatchValidatorReceipts,
} from "./lib/patch-validator-image-receipts.mjs";
import { applyReviewedEmbeddedRuntimeApplicability } from "./lib/patch-validator-embedded-runtime-applicability.mjs";
import { verifyBinaryGrypeDatabaseBinding } from "./lib/patch-validator-binary-grype-database-binding.mjs";
import { verifyStaticRuntimeBinaryEvidence } from "./lib/patch-validator-static-runtime-evidence.mjs";

export {
  MAX_RECEIPT_BYTES,
  verifyPatchValidatorReceipts,
  verifyStaticRuntimeBinaryEvidence,
};

function parseArguments(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag?.startsWith("--") || value === undefined) {
      throw new Error("patch-validator receipt verifier arguments are incomplete");
    }
    if (values.has(flag)) {
      throw new Error(`duplicate patch-validator verifier argument: ${flag}`);
    }
    values.set(flag, value);
  }
  const required = [
    "--metadata",
    "--smoke",
    "--sbom",
    "--vulnerability-scan",
    "--binary-sbom",
    "--binary-vulnerability-scan",
    "--embedded-runtime-inventory",
    "--embedded-vulnerability-scan",
    "--expected-image-digest",
    "--expected-source-revision",
  ];
  for (const flag of required) {
    if (!values.has(flag)) {
      throw new Error(`missing patch-validator verifier argument: ${flag}`);
    }
  }
  if (values.size !== required.length) {
    throw new Error("unknown patch-validator verifier argument");
  }
  return values;
}

export function main(args = process.argv.slice(2)) {
  const values = parseArguments(args);
  const expectedImageDigest = values.get("--expected-image-digest");
  const receipt = verifyPatchValidatorReceipts({
    metadata: readBoundedJson(values.get("--metadata")),
    smokeResult: readBoundedJson(values.get("--smoke")),
    sbom: readBoundedJson(values.get("--sbom"), MAX_RECEIPT_BYTES),
    vulnerabilityScan: readBoundedJson(
      values.get("--vulnerability-scan"),
      MAX_RECEIPT_BYTES,
    ),
    expectedImageDigest,
    expectedSourceRevision: values.get("--expected-source-revision"),
  });
  const binaryVulnerabilityScan = readBoundedJson(
    values.get("--binary-vulnerability-scan"),
    MAX_RECEIPT_BYTES,
  );
  const embeddedRuntimeInventory = readBoundedJson(
    values.get("--embedded-runtime-inventory"),
    MAX_RECEIPT_BYTES,
  );
  const embeddedVulnerabilityScan = readBoundedJson(
    values.get("--embedded-vulnerability-scan"),
    MAX_RECEIPT_BYTES,
  );
  const reviewedApplicability = applyReviewedEmbeddedRuntimeApplicability({
    inventory: embeddedRuntimeInventory,
    scan: embeddedVulnerabilityScan,
  });
  const staticRuntimeReceipt = verifyStaticRuntimeBinaryEvidence({
    binarySbom: readBoundedJson(
      values.get("--binary-sbom"),
      MAX_RECEIPT_BYTES,
    ),
    binaryVulnerabilityScan,
    embeddedRuntimeInventory,
    embeddedVulnerabilityScan: reviewedApplicability.scan,
    expectedImageDigest,
  });
  verifyBinaryGrypeDatabaseBinding({
    binaryVulnerabilityScan,
    embeddedVulnerabilityScan: reviewedApplicability.scan,
  });
  process.stdout.write(
    `${JSON.stringify({
      ...receipt,
      ...staticRuntimeReceipt,
      non_applicable_embedded_runtime_matches:
        reviewedApplicability.nonApplicableMatches,
    }, null, 2)}\n`,
  );
}

main();
