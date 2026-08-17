import { describe, expect, it } from "vitest";

import { DATA_ROOM_CATALOG } from "../scripts/lib/acquisition-data-room-catalog.mjs";

describe("orchestrator gateway acquisition catalog", () => {
  it("keeps the gateway contract and consumer documentation in the trusted buyer catalog", () => {
    expect(DATA_ROOM_CATALOG).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "orchestrator-gateway-contract",
          category: "product",
          kind: "file",
          path: "contracts/orchestrator-gateway.json",
          required: true,
          requiredForFinalGate: true,
        }),
        expect.objectContaining({
          id: "orchestrator-gateway-consumer-doc",
          category: "product",
          kind: "file",
          path: "docs/orchestrator-gateway-consumer-contract.md",
          required: true,
          requiredForFinalGate: true,
        }),
      ]),
    );
  });
});
