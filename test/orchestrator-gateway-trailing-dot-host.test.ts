import { describe, expect, it } from "vitest";
import {
  directProviderHosts,
  parseOrchestratorGatewayUrl,
} from "../scripts/lib/orchestrator-gateway.mjs";

describe("contextual-orchestrator direct-provider hostname canonicalization", () => {
  it("rejects DNS-root-dot aliases of every forbidden direct provider host", () => {
    for (const host of directProviderHosts()) {
      expect(() => parseOrchestratorGatewayUrl(`https://${host}./v1`)).toThrow(
        /contextual-orchestrator, not a direct model provider/,
      );
    }
  });

  it.each(["https://./v1", "https://../v1"])(
    "rejects a root-dot-only hostname before any health request: %s",
    (url) => {
      expect(() => parseOrchestratorGatewayUrl(url)).toThrow(
        /absolute HTTPS URL/,
      );
    },
  );
});
