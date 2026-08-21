import { describe, expect, it } from "vitest";

import { applyReviewedEmbeddedRuntimeApplicability } from "../scripts/lib/patch-validator-embedded-runtime-applicability.mjs";

const nghttp2Cpe = "cpe:2.3:a:nghttp2:nghttp2:1.69.0:*:*:*:*:*:*:*";
const v8Cpe = "cpe:2.3:a:google:v8:13.6.233.17:*:*:*:*:*:*:*";

function componentScan(
  key: string,
  name: string,
  version: string,
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
          artifact: { name, version, cpes: [cpe] },
          vulnerability: { id: vulnerabilityId, severity },
          matchDetails: [
            {
              type: "cpe-match",
              searchedBy: {
                namespace: "nvd:cpe",
                cpes: [cpe],
                package: { name, version },
              },
            },
          ],
        },
      ],
    },
  };
}

function inventory() {
  return {
    node_version: "24.19.0",
    process_versions: {
      node: "24.19.0",
      nghttp2: "1.69.0",
      v8: "13.6.233.17-node.51",
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
        key: "v8",
        name: "v8",
        version: "13.6.233.17-node.51",
        classification: "bundled_dependency",
        cpe: v8Cpe,
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
    "marks legacy V8 advisory %s non-applicable to the exact Node 24.19.0 V8 runtime",
    (vulnerabilityId) => {
      const scan = {
        components: [
          componentScan(
            "v8",
            "v8",
            "13.6.233.17-node.51",
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

  it("does not convert a different nghttp2 advisory into an applicability exception", () => {
    const scan = {
      components: [
        componentScan(
          "nghttp2",
          "nghttp2",
          "1.69.0",
          nghttp2Cpe,
          "CVE-2099-4242",
          "Medium",
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
