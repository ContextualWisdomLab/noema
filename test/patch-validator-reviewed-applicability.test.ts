import { describe, expect, it } from "vitest";

import { applyReviewedEmbeddedRuntimeApplicability } from "../scripts/lib/patch-validator-embedded-runtime-applicability.mjs";

const nghttp2Cpe = "cpe:2.3:a:nghttp2:nghttp2:1.69.0:*:*:*:*:*:*:*";
const v8Cpe = "cpe:2.3:a:google:v8:13.6.233.17:*:*:*:*:*:*:*";
const sqliteCpe = "cpe:2.3:a:sqlite:sqlite:3.53.3:*:*:*:*:*:*:*";
const zlibCpe = "cpe:2.3:a:zlib:zlib:1.3.2.1-motley-3246f1b:*:*:*:*:*:*:*";

function componentScan(
  key: string,
  name: string,
  componentVersion: string,
  scannerArtifactVersion: string,
  cpe: string,
  vulnerabilityId: string,
  severity: string,
) {
  return {
    key,
    identity: cpe,
    scanner_output: {
      descriptor: { name: "grype", version: "0.116.1" },
      source: { type: "cpe", target: cpe },
      matches: [
        {
          artifact: { name, version: scannerArtifactVersion, cpes: [cpe] },
          vulnerability: { id: vulnerabilityId, severity },
          matchDetails: [
            {
              type: "cpe-match",
              searchedBy: {
                namespace: "nvd:cpe",
                cpes: [cpe],
                package: { name, version: scannerArtifactVersion },
              },
            },
          ],
        },
      ],
    },
    componentVersion,
  };
}

function inventory() {
  return {
    node_version: "24.19.0",
    process_versions: {
      node: "24.19.0",
      nghttp2: "1.69.0",
      sqlite: "3.53.3",
      v8: "13.6.233.17-node.51",
      zlib: "1.3.2.1-motley-3246f1b",
    },
    components: [
      {
        key: "nghttp2",
        name: "nghttp2",
        version: "1.69.0",
        classification: "bundled_dependency",
        cpe: nghttp2Cpe,
      },
      {
        key: "sqlite",
        name: "sqlite",
        version: "3.53.3",
        classification: "bundled_dependency",
        cpe: sqliteCpe,
      },
      {
        key: "v8",
        name: "v8",
        version: "13.6.233.17-node.51",
        classification: "bundled_dependency",
        cpe: v8Cpe,
      },
      {
        key: "zlib",
        name: "zlib",
        version: "1.3.2.1-motley-3246f1b",
        classification: "bundled_dependency",
        cpe: zlibCpe,
      },
    ],
  };
}

describe("reviewed embedded-runtime applicability", () => {
  it("marks the nghttpx-only request-smuggling CVE non-applicable to Node's embedded libnghttp2", () => {
    const scan = {
      components: [
        componentScan(
          "nghttp2",
          "nghttp2",
          "1.69.0",
          "1.69.0",
          nghttp2Cpe,
          "CVE-2026-58055",
          "Medium",
        ),
      ],
    };

    const reviewed = applyReviewedEmbeddedRuntimeApplicability({
      inventory: inventory(),
      scan,
    });

    expect(reviewed.scan.components[0].scanner_output.matches).toEqual([]);
    expect(reviewed.nonApplicableMatches).toContainEqual({
      component_key: "nghttp2",
      vulnerability_id: "CVE-2026-58055",
      reason: "CVE affects the nghttpx proxy, not Node's embedded libnghttp2 runtime",
    });
  });

  it.each(["CVE-2015-5380", "CVE-2011-5037", "CVE-2011-3886"])(
    "marks legacy V8 advisory %s non-applicable to the exact Node 24.19.0 V8 runtime even when Grype reports the normalized CPE version",
    (vulnerabilityId) => {
      const scan = {
        components: [
          componentScan(
            "v8",
            "v8",
            "13.6.233.17-node.51",
            "13.6.233.17",
            v8Cpe,
            vulnerabilityId,
            "High",
          ),
        ],
      };

      const reviewed = applyReviewedEmbeddedRuntimeApplicability({
        inventory: inventory(),
        scan,
      });

      expect(reviewed.scan.components[0].scanner_output.matches).toEqual([]);
      expect(reviewed.nonApplicableMatches).toContainEqual({
        component_key: "v8",
        vulnerability_id: vulnerabilityId,
        reason: "Exact Node 24.19.0 V8 runtime is newer than the reviewed affected legacy V8 releases",
      });
    },
  );

  it("marks CVE-2026-85046 non-applicable only to the exact Node 24.19.0 V8 branch/CPE", () => {
    const scan = {
      components: [
        componentScan(
          "v8",
          "v8",
          "13.6.233.17-node.51",
          "13.6.233.17",
          v8Cpe,
          "CVE-2026-85046",
          "High",
        ),
      ],
    };

    const reviewed = applyReviewedEmbeddedRuntimeApplicability({
      inventory: inventory(),
      scan,
    });

    expect(reviewed.scan.components[0].scanner_output.matches).toEqual([]);
    expect(reviewed.nonApplicableMatches).toContainEqual({
      component_key: "v8",
      vulnerability_id: "CVE-2026-85046",
      reason: "Exact Node 24.19.0 V8 branch lacks the vulnerable inlined Array.prototype.sort reducers",
    });

    const differentNode = inventory();
    differentNode.node_version = "24.19.1";
    differentNode.process_versions.node = "24.19.1";
    const retained = applyReviewedEmbeddedRuntimeApplicability({
      inventory: differentNode,
      scan,
    });
    expect(retained.scan).toBe(scan);
    expect(retained.nonApplicableMatches).toEqual([]);
  });

  it.each([
    "BIT-sqlite-2024-0232",
    "BIT-sqlite-2025-29088",
    "BIT-sqlite-2025-6965",
  ])(
    "marks reviewed fixed-range SQLite finding %s non-applicable to exact SQLite 3.53.3",
    (vulnerabilityId) => {
      const scan = {
        components: [
          componentScan(
            "sqlite",
            "sqlite",
            "3.53.3",
            "3.53.3",
            sqliteCpe,
            vulnerabilityId,
            "High",
          ),
        ],
      };

      const reviewed = applyReviewedEmbeddedRuntimeApplicability({
        inventory: inventory(),
        scan,
      });

      expect(reviewed.scan.components[0].scanner_output.matches).toEqual([]);
      expect(reviewed.nonApplicableMatches).toContainEqual({
        component_key: "sqlite",
        vulnerability_id: vulnerabilityId,
        reason: "Exact SQLite 3.53.3 runtime is newer than the reviewed affected SQLite ranges",
      });
    },
  );

  it("rejects the RubyGems zlib advisory as a product mismatch for Node's embedded C zlib", () => {
    const scan = {
      components: [
        componentScan(
          "zlib",
          "zlib",
          "1.3.2.1-motley-3246f1b",
          "1.3.2.1-motley-3246f1b",
          zlibCpe,
          "GHSA-g857-hhfv-j68w",
          "Medium",
        ),
      ],
    };

    const reviewed = applyReviewedEmbeddedRuntimeApplicability({
      inventory: inventory(),
      scan,
    });

    expect(reviewed.scan.components[0].scanner_output.matches).toEqual([]);
    expect(reviewed.nonApplicableMatches).toContainEqual({
      component_key: "zlib",
      vulnerability_id: "GHSA-g857-hhfv-j68w",
      reason: "Advisory applies to the Ruby zlib gem GzipReader wrapper, not Node's embedded C zlib runtime",
    });
  });

  it("does not convert an unreviewed advisory into an applicability exception", () => {
    const scan = {
      components: [
        componentScan(
          "sqlite",
          "sqlite",
          "3.53.3",
          "3.53.3",
          sqliteCpe,
          "CVE-2099-4242",
          "High",
        ),
      ],
    };

    const reviewed = applyReviewedEmbeddedRuntimeApplicability({
      inventory: inventory(),
      scan,
    });

    expect(reviewed.scan).toBe(scan);
    expect(reviewed.nonApplicableMatches).toEqual([]);
  });

  it("requires exact NVD CPE provenance before applying a reviewed exception", () => {
    const scan = {
      components: [
        componentScan(
          "nghttp2",
          "nghttp2",
          "1.69.0",
          "1.69.0",
          nghttp2Cpe,
          "CVE-2026-58055",
          "Medium",
        ),
      ],
    };
    scan.components[0].scanner_output.matches[0].matchDetails[0].searchedBy.namespace =
      "github:language:c";

    const reviewed = applyReviewedEmbeddedRuntimeApplicability({
      inventory: inventory(),
      scan,
    });

    expect(reviewed.scan).toBe(scan);
    expect(reviewed.nonApplicableMatches).toEqual([]);
  });
});
