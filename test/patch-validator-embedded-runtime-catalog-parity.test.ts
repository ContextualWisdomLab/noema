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

  it("accepts only the exact reviewed GitHub PURL for Ada", () => {
    const identity = reviewedIdentityFor("ada", "3.4.4");
    expect(identity).toEqual({
      name: "ada",
      purl: "pkg:github/ada-url/ada@3.4.4",
    });
    expect(
      expectedIdentityForComponent({
        key: "ada",
        name: "ada",
        version: "3.4.4",
        purl: "pkg:github/ada-url/ada@3.4.4",
      }),
    ).toBe("pkg:github/ada-url/ada@3.4.4");
    expect(() =>
      expectedIdentityForComponent({
        key: "ada",
        name: "ada",
        version: "3.4.4",
        purl: "pkg:github/attacker/ada@3.4.4",
      }),
    ).toThrow(/does not match the reviewed identity catalog/i);
  });
});
