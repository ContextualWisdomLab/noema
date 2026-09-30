import { describe, expect, it } from "vitest";

import { generateEmbeddedRuntimeInventory } from "../scripts/lib/patch-validator-embedded-runtime-inventory.mjs";

const imageDigest = `sha256:${"4".repeat(64)}`;

describe("patch-validator embedded runtime inventory", () => {
  it("rejects the vulnerable Undici bundled by the superseded Node runtime", () => {
    expect(() =>
      generateEmbeddedRuntimeInventory(
        { node: "24.21.0", undici: "7.29.0" },
        imageDigest,
      ),
    ).toThrow(/undici.*7\.29\.1/i);
  });

  it("uses reviewed c-ares and Brotli identities and keeps disabled QUIC keys explicit", () => {
    const { inventory, scanPlan } = generateEmbeddedRuntimeInventory(
      {
        node: "24.21.0",
        undici: "7.29.1",
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
      {
        key: "undici",
        identity: "pkg:npm/undici@7.29.1",
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

  it("keeps Node-internal ncrypto version evidence out of the external vulnerability scan plan", () => {
    const { inventory, scanPlan } = generateEmbeddedRuntimeInventory(
      {
        node: "24.21.0",
        undici: "7.29.1",
        ares: "1.34.6",
        ncrypto: "0.0.1",
      },
      imageDigest,
    );

    expect(scanPlan).toEqual([
      {
        key: "ares",
        identity: "cpe:2.3:a:c-ares:c-ares:1.34.6:*:*:*:*:*:*:*",
      },
      {
        key: "undici",
        identity: "pkg:npm/undici@7.29.1",
      },
    ]);
    expect(inventory.components).toContainEqual({
      key: "ncrypto",
      name: "ncrypto",
      version: "0.0.1",
      classification: "runtime_metadata",
      reason: "Node.js internal crypto implementation version",
    });
  });

  it("fails closed on an unreviewed non-empty bundled dependency", () => {
    expect(() =>
      generateEmbeddedRuntimeInventory(
        {
          node: "24.21.0",
          undici: "7.29.1",
          unknown_native_dependency: "1.2.3",
        },
        imageDigest,
      ),
    ).toThrow(/no reviewed vulnerability identity/i);
  });

  it("rejects an empty version unless the key is a reviewed disabled feature", () => {
    expect(() =>
      generateEmbeddedRuntimeInventory(
        { node: "24.21.0", undici: "7.29.1", openssl: "" },
        imageDigest,
      ),
    ).toThrow(/invalid version/i);
  });
});
