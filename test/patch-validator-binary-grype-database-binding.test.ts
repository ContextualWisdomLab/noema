import { describe, expect, it } from "vitest";

import { verifyBinaryGrypeDatabaseBinding } from "../scripts/lib/patch-validator-binary-grype-database-binding.mjs";

const digestA = `sha256:${"a".repeat(64)}`;
const digestB = `sha256:${"b".repeat(64)}`;

function database(error: string | null = null, reverseProviders = false): any {
  const nvd = { captured: "2026-08-06T00:00:00Z", input: digestA };
  const osv = { captured: "2026-08-05T00:00:00Z", input: digestB };
  return {
    status: {
      schemaVersion: "v6.0.2",
      built: "2026-08-07T00:00:00Z",
      valid: true,
      error,
    },
    providers: reverseProviders ? { osv, nvd } : { nvd, osv },
  };
}

function validInput(error: string | null = null): any {
  return {
    binaryVulnerabilityScan: {
      descriptor: { db: database(error, true) },
    },
    embeddedVulnerabilityScan: {
      components: [
        {
          scanner_output: {
            descriptor: { db: database(error) },
          },
        },
      ],
    },
  };
}

describe("binary Grype database binding", () => {
  it("accepts the same validated provider snapshot independent of provider serialization order", () => {
    expect(() => verifyBinaryGrypeDatabaseBinding(validInput())).not.toThrow();
  });

  it("preserves an allowed empty scanner database error field in the identity", () => {
    expect(() => verifyBinaryGrypeDatabaseBinding(validInput(""))).not.toThrow();
  });

  const invalidCases: Array<[string, (input: any) => void, RegExp]> = [
    ["binary scan", (x) => { x.binaryVulnerabilityScan = null; }, /binary Grype vulnerability scan/i],
    ["binary descriptor", (x) => { x.binaryVulnerabilityScan.descriptor = null; }, /binary Grype descriptor/i],
    ["embedded scan", (x) => { x.embeddedVulnerabilityScan = null; }, /embedded runtime vulnerability scan/i],
    ["components type", (x) => { x.embeddedVulnerabilityScan.components = null; }, /database-bound components/i],
    ["components empty", (x) => { x.embeddedVulnerabilityScan.components = []; }, /database-bound components/i],
    ["component record", (x) => { x.embeddedVulnerabilityScan.components[0] = null; }, /embedded runtime component scan/i],
    ["scanner output", (x) => { x.embeddedVulnerabilityScan.components[0].scanner_output = null; }, /embedded runtime raw scanner evidence/i],
    ["embedded descriptor", (x) => { x.embeddedVulnerabilityScan.components[0].scanner_output.descriptor = null; }, /embedded runtime Grype descriptor/i],
    ["binary database", (x) => { x.binaryVulnerabilityScan.descriptor.db = null; }, /binary Grype database evidence/i],
    ["database status", (x) => { x.binaryVulnerabilityScan.descriptor.db.status = null; }, /binary Grype database status evidence/i],
    ["database providers", (x) => { x.binaryVulnerabilityScan.descriptor.db.providers = null; }, /binary Grype database providers evidence/i],
    ["database provider", (x) => { x.binaryVulnerabilityScan.descriptor.db.providers.nvd = null; }, /binary Grype database provider evidence/i],
    ["database mismatch", (x) => { x.binaryVulnerabilityScan.descriptor.db.status.built = "2026-08-06T00:00:00Z"; }, /does not match/i],
  ];

  it.each(invalidCases)("rejects invalid %s evidence", (_name, mutate, message) => {
    const input = validInput();
    mutate(input);
    expect(() => verifyBinaryGrypeDatabaseBinding(input)).toThrow(message);
  });
});
