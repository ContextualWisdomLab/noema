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

/**
 * Noema-specific product evidence layered on top of the hardened acquisition
 * integrity catalog. The integrity verifier receives this exact composed
 * catalog from both production entrypoints, so gateway evidence remains inside
 * the same strict immutable-entry validation boundary as the base catalog.
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
]);
