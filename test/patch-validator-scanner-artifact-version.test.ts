import { describe, expect, it } from "vitest";

import { expectedScannerArtifactVersion } from "../scripts/lib/patch-validator-static-runtime-evidence.mjs";

describe("patch-validator embedded scanner artifact version binding", () => {
  it("uses the reviewed upstream CPE version for Node-patched V8", () => {
    expect(
      expectedScannerArtifactVersion(
        "cpe:2.3:a:google:v8:13.6.233.17:*:*:*:*:*:*:*",
        "13.6.233.17-node.51",
      ),
    ).toBe("13.6.233.17");
  });

  it("keeps ordinary CPE and PURL versions exact", () => {
    expect(
      expectedScannerArtifactVersion(
        "cpe:2.3:a:openssl:openssl:3.5.2:*:*:*:*:*:*:*",
        "3.5.2",
      ),
    ).toBe("3.5.2");
    expect(
      expectedScannerArtifactVersion("pkg:npm/undici@7.13.0", "7.13.0"),
    ).toBe("7.13.0");
  });

  it("fails closed instead of accepting an unreviewable CPE shape", () => {
    expect(() =>
      expectedScannerArtifactVersion("cpe:2.3:a:google:v8", "13.6.233.17-node.51"),
    ).toThrow(/reviewed CPE identity is invalid/i);
  });
});
