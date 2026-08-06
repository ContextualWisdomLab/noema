#!/usr/bin/env node

import {
  MAX_RECEIPT_BYTES,
  readBoundedJson,
  verifyPatchValidatorReceipts,
} from "./lib/patch-validator-image-receipts.mjs";

export { MAX_RECEIPT_BYTES, verifyPatchValidatorReceipts };

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
  const receipt = verifyPatchValidatorReceipts({
    metadata: readBoundedJson(values.get("--metadata")),
    smokeResult: readBoundedJson(values.get("--smoke")),
    sbom: readBoundedJson(values.get("--sbom"), MAX_RECEIPT_BYTES),
    vulnerabilityScan: readBoundedJson(
      values.get("--vulnerability-scan"),
      MAX_RECEIPT_BYTES,
    ),
    expectedImageDigest: values.get("--expected-image-digest"),
    expectedSourceRevision: values.get("--expected-source-revision"),
  });
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

main();
