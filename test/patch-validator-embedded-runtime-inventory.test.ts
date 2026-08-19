import { describe, expect, it } from "vitest";

import { generateEmbeddedRuntimeInventory } from "../scripts/lib/patch-validator-embedded-runtime-inventory.mjs";

const imageDigest = `sha256:${"4".repeat(64)}`;

describe("patch-validator embedded runtime inventory", () => {
  it("uses reviewed c-ares and Brotli identities and keeps disabled QUIC keys explicit", () => {
    const { inventory, scanPlan } = generateEmbeddedRuntimeInventory(
      {
        node: "24.19.0",
        ares: "1.34.6",
        brotli: "1.2.0",
        cldr: "48.0",
        modules: "137",
        napi: "10",
        nghttp3: "",
        ngtcp2: "",
        tz: "2026b",
        unicode: "17.0",
      },
      imageDigest,
    );

    expect(scanPlan).toEqual([
      {
        key: "ares",
        identity: "cpe:2.3:a:c-ares:c-ares:1.34.6:*:*:*:*:*:*:*",
      },
      {
        key: "brotli",
        identity: "cpe:2.3:a:google:brotli:1.2.0:*:*:*:*:*:*:*",
      },
    ]);
    expect(inventory.components).toContainEqual({
      key: "ngtcp2",
      name: "ngtcp2",
      version: "",
      classification: "runtime_metadata",
      reason: "QUIC transport dependency disabled in this build",
    });
    expect(inventory.components).toContainEqual({
      key: "cldr",
      name: "cldr",
      version: "48.0",
      classification: "runtime_metadata",
      reason: "CLDR data version reported by the bundled ICU runtime",
    });
  });

  it("fails closed on an unreviewed non-empty bundled dependency", () => {
    expect(() =>
      generateEmbeddedRuntimeInventory(
        { node: "24.19.0", unknown_native_dependency: "1.2.3" },
        imageDigest,
      ),
    ).toThrow(/no reviewed vulnerability identity/i);
  });

  it("rejects an empty version unless the key is a reviewed disabled feature", () => {
    expect(() =>
      generateEmbeddedRuntimeInventory(
        { node: "24.19.0", openssl: "" },
        imageDigest,
      ),
    ).toThrow(/invalid version/i);
  });
});
