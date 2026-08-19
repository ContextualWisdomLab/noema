const CPE_APPLICATION = "cpe:2.3:a";

export const RUNTIME_METADATA_REASONS = new Map([
  ["modules", "Node.js native module ABI version"],
  ["napi", "Node-API compatibility level"],
  ["cldr", "CLDR data version reported by the bundled ICU runtime"],
  ["tz", "time-zone data version reported by the bundled ICU runtime"],
  ["unicode", "Unicode data version reported by the bundled ICU runtime"],
]);

export const DISABLED_RUNTIME_METADATA_REASONS = new Map([
  ["nghttp3", "HTTP/3 dependency disabled in this build"],
  ["ngtcp2", "QUIC transport dependency disabled in this build"],
]);

export const REVIEWED_COMPONENT_IDENTITIES = new Map([
  ["acorn", { name: "acorn", identityType: "npm", npmPackage: "acorn" }],
  [
    "ada",
    {
      name: "ada",
      identityType: "github",
      githubNamespace: "ada-url",
      githubRepository: "ada",
    },
  ],
  ["amaro", { name: "amaro", identityType: "npm", npmPackage: "amaro" }],
  [
    "ares",
    {
      name: "c-ares",
      identityType: "cpe",
      cpeVendor: "c-ares",
      cpeProduct: "c-ares",
    },
  ],
  [
    "brotli",
    {
      name: "brotli",
      identityType: "cpe",
      cpeVendor: "google",
      cpeProduct: "brotli",
    },
  ],
  [
    "icu",
    {
      name: "international_components_for_unicode",
      identityType: "cpe",
      cpeVendor: "icu-project",
      cpeProduct: "international_components_for_unicode",
    },
  ],
  [
    "llhttp",
    {
      name: "llhttp",
      identityType: "cpe",
      cpeVendor: "llhttp",
      cpeProduct: "llhttp",
      cpeTargetSoftware: "node.js",
    },
  ],
  [
    "nghttp2",
    {
      name: "nghttp2",
      identityType: "cpe",
      cpeVendor: "nghttp2",
      cpeProduct: "nghttp2",
    },
  ],
  [
    "ngtcp2",
    {
      name: "ngtcp2",
      identityType: "cpe",
      cpeVendor: "nghttp2",
      cpeProduct: "ngtcp2",
    },
  ],
  [
    "openssl",
    {
      name: "openssl",
      identityType: "cpe",
      cpeVendor: "openssl",
      cpeProduct: "openssl",
    },
  ],
  [
    "sqlite",
    {
      name: "sqlite",
      identityType: "cpe",
      cpeVendor: "sqlite",
      cpeProduct: "sqlite",
    },
  ],
  ["undici", { name: "undici", identityType: "npm", npmPackage: "undici" }],
  [
    "uv",
    {
      name: "libuv",
      identityType: "cpe",
      cpeVendor: "libuv",
      cpeProduct: "libuv",
    },
  ],
  [
    "zstd",
    {
      name: "zstandard",
      identityType: "cpe",
      cpeVendor: "facebook",
      cpeProduct: "zstandard",
    },
  ],
]);

function requireText(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.length > 128) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function cpeFor(definition, version) {
  const targetSoftware = definition.cpeTargetSoftware ?? "*";
  return `${CPE_APPLICATION}:${definition.cpeVendor}:${definition.cpeProduct}:${version}:*:*:*:*:${targetSoftware}:*:*`;
}

export function reviewedIdentityFor(key, version) {
  const definition = REVIEWED_COMPONENT_IDENTITIES.get(key);
  if (definition === undefined) {
    return null;
  }
  requireText(version, `process.versions ${key} version`);
  if (definition.identityType === "npm") {
    return {
      name: definition.name,
      purl: `pkg:npm/${definition.npmPackage}@${version}`,
    };
  }
  if (definition.identityType === "github") {
    return {
      name: definition.name,
      purl: `pkg:github/${definition.githubNamespace}/${definition.githubRepository}@${version}`,
    };
  }
  if (definition.identityType === "cpe") {
    return { name: definition.name, cpe: cpeFor(definition, version) };
  }
  throw new Error(`reviewed identity type for ${key} is unsupported`);
}

export function expectedIdentityForComponent(component) {
  const definition = REVIEWED_COMPONENT_IDENTITIES.get(component.key);
  if (definition === undefined) {
    throw new Error(
      `embedded runtime component ${String(component.key)} has no reviewed vulnerability identity in the identity catalog`,
    );
  }
  const expected = reviewedIdentityFor(component.key, component.version);
  if (component.name !== expected.name) {
    throw new Error(
      `embedded runtime component ${component.key} name does not match the reviewed identity catalog`,
    );
  }
  const actualPurl = typeof component.purl === "string" ? component.purl : null;
  const actualCpe = typeof component.cpe === "string" ? component.cpe : null;
  const expectedPurl = expected.purl ?? null;
  const expectedCpe = expected.cpe ?? null;
  if (actualPurl !== expectedPurl || actualCpe !== expectedCpe) {
    throw new Error(
      `embedded runtime component ${component.key} vulnerability identity does not match the reviewed identity catalog`,
    );
  }
  return expectedPurl ?? expectedCpe;
}
