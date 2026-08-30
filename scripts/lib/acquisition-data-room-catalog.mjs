import { DATA_ROOM_CATALOG as BASE_DATA_ROOM_CATALOG } from "./acquisition-data-room-integrity.mjs";

/** Build one immutable required file entry for the composed buyer catalog. */
function requiredFile(id, category, path) {
  return Object.freeze({
    id,
    category,
    kind: "file",
    path,
    required: true,
    requiredForFinalGate: true,
  });
}

/** Build one immutable generated evidence entry required only for the final buyer gate. */
function finalEvidenceFile(id, category, path, validatedBy, statusMeaning) {
  return Object.freeze({
    id,
    category,
    kind: "file",
    path,
    required: false,
    requiredForFinalGate: true,
    validatedBy,
    statusMeaning,
  });
}

/**
 * Noema-specific product and transfer evidence layered on top of the hardened
 * acquisition integrity catalog. The integrity verifier receives this exact
 * composed catalog from both production entrypoints, so these entries remain
 * inside the same strict immutable-entry validation boundary as the base
 * catalog without treating generated licensing metadata as legal authority.
 */
export const DATA_ROOM_CATALOG = Object.freeze([
  ...BASE_DATA_ROOM_CATALOG,
  requiredFile(
    "orchestrator-gateway-contract",
    "product",
    "contracts/orchestrator-gateway.json",
  ),
  requiredFile(
    "orchestrator-gateway-consumer-doc",
    "product",
    "docs/orchestrator-gateway-consumer-contract.md",
  ),
  finalEvidenceFile(
    "dependency-license-inventory",
    "transfer",
    "artifacts/release/dependency-licenses.json",
    "npm run release:dependency-license-inventory",
    "generated file presence only; owner/legal compatibility and NOTICE obligations remain independent evidence",
  ),
]);