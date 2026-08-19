import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  expectedIdentityForComponent,
  reviewedIdentityFor,
} from "../scripts/lib/patch-validator-embedded-runtime-catalog.mjs";

const workflow = readFileSync(
  new URL("../.github/workflows/patch-validator-image.yml", import.meta.url),
  "utf8",
);
const verifier = readFileSync(
  new URL("../scripts/lib/patch-validator-static-runtime-evidence.mjs", import.meta.url),
  "utf8",
);

describe("patch-validator embedded-runtime reviewed identity catalog parity", () => {
  it("uses the same catalog from workflow generation through verification", () => {
    expect(workflow).toContain(
      'generateEmbeddedRuntimeInventory } from "./scripts/lib/patch-validator-embedded-runtime-inventory.mjs"',
    );
    expect(verifier).toContain(
      'expectedIdentityForComponent,\n} from "./patch-validator-embedded-runtime-catalog.mjs"',
    );
  });

  it.each([
    ["ares", "1.34.6", "cpe:2.3:a:c-ares:c-ares:1.34.6:*:*:*:*:*:*:*"],
    ["brotli", "1.2.0", "cpe:2.3:a:google:brotli:1.2.0:*:*:*:*:*:*:*"],
  ])("keeps %s on its authoritative reviewed CPE", (key, version, expected) => {
    const identity = reviewedIdentityFor(key, version);
    expect(identity?.cpe).toBe(expected);
    expect(
      expectedIdentityForComponent({ key, name: identity?.name, version, cpe: expected }),
    ).toBe(expected);
  });

  it.each([
    ["ada", "3.4.4", "ada-url", "ada"],
    ["merve", "1.2.2", "anonrig", "merve"],
    ["nbytes", "0.1.4", "nodejs", "nbytes"],
    ["simdjson", "3.13.0", "simdjson", "simdjson"],
    ["simdutf", "6.4.0", "simdutf", "simdutf"],
    ["uvwasi", "0.0.23", "nodejs", "uvwasi"],
  ])(
    "binds %s to the exact upstream release tag in its reviewed GitHub PURL",
    (key, version, namespace, repository) => {
      const expected = `pkg:github/${namespace}/${repository}@v${version}`;
      const identity = reviewedIdentityFor(key, version);
      expect(identity).toEqual({ name: key, purl: expected });
      expect(
        expectedIdentityForComponent({ key, name: key, version, purl: expected }),
      ).toBe(expected);
      expect(() =>
        expectedIdentityForComponent({
          key,
          name: key,
          version,
          purl: `pkg:github/${namespace}/${repository}@${version}`,
        }),
      ).toThrow(/does not match the reviewed identity catalog/i);
    },
  );
});
