import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  new URL("../.github/workflows/patch-validator-image.yml", import.meta.url),
  "utf8",
);
const verifier = readFileSync(
  new URL("../scripts/lib/patch-validator-static-runtime-evidence.mjs", import.meta.url),
  "utf8",
);

describe("patch-validator embedded-runtime reviewed identity catalog parity", () => {
  it.each([
    ["ares", "c-ares", "c-ares"],
    ["brotli", "google", "brotli"],
  ])("keeps %s authoritative CPE identity aligned between workflow and verifier", (key, vendor, product) => {
    const workflowIdentity =
      `cpe: \\`cpe:2.3:a:${vendor}:${product}:\${version}:*:*:*:*:*:*:*\\``;
    expect(workflow).toContain(`${key}: {`);
    expect(workflow).toContain(workflowIdentity);
    expect(verifier).toContain(`\"${key}\"`);
    expect(verifier).toContain(`cpeVendor: \"${vendor}\"`);
    expect(verifier).toContain(`cpeProduct: \"${product}\"`);
  });
});
