import { describe, expect, it } from "vitest";
import { DATA_ROOM_CATALOG as BASE_DATA_ROOM_CATALOG } from "../scripts/lib/acquisition-data-room-integrity.mjs";
import { DATA_ROOM_CATALOG } from "../scripts/lib/acquisition-data-room-catalog.mjs";

describe("composed acquisition data-room catalog", () => {
  it("preserves the hardened base catalog and appends immutable Noema evidence", () => {
    expect(Object.isFrozen(DATA_ROOM_CATALOG)).toBe(true);
    expect(DATA_ROOM_CATALOG.slice(0, BASE_DATA_ROOM_CATALOG.length)).toEqual(
      BASE_DATA_ROOM_CATALOG,
    );

    const appendedEntries = DATA_ROOM_CATALOG.slice(BASE_DATA_ROOM_CATALOG.length);
    expect(appendedEntries).toEqual([
      {
        id: "orchestrator-gateway-contract",
        category: "product",
        kind: "file",
        path: "contracts/orchestrator-gateway.json",
        required: true,
        requiredForFinalGate: true,
      },
      {
        id: "orchestrator-gateway-consumer-doc",
        category: "product",
        kind: "file",
        path: "docs/orchestrator-gateway-consumer-contract.md",
        required: true,
        requiredForFinalGate: true,
      },
      {
        id: "dependency-license-inventory",
        category: "transfer",
        kind: "file",
        path: "artifacts/release/dependency-licenses.json",
        required: false,
        requiredForFinalGate: true,
        validatedBy: "npm run release:dependency-license-inventory",
        statusMeaning:
          "generated file presence only; owner/legal compatibility and NOTICE obligations remain independent evidence",
      },
    ]);
    expect(appendedEntries.every((entry) => Object.isFrozen(entry))).toBe(true);
  });
});