import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  new URL("../.github/workflows/patch-validator-image.yml", import.meta.url),
  "utf8",
);

describe("patch-validator embedded-runtime workflow", () => {
  it("never fabricates generic package identities or local completion assessments", () => {
    expect(workflow).not.toContain("pkg:generic/");
    expect(workflow).not.toContain("assessment:");
  });

  it("updates the vulnerability database once and disables per-component auto-update", () => {
    expect(workflow).toContain('"$SCANNER_BIN_DIR/grype" --config "$grype_config" db update');
    expect(workflow).toContain("GRYPE_DB_AUTO_UPDATE=false");
  });

  it("uses the registered GitHub Package URL identity for the bundled Ada runtime dependency", () => {
    expect(workflow).toContain("ada: {");
    expect(workflow).toContain('purl: `pkg:github/ada-url/ada@${version}`');
  });

  it("uses authoritative NVD CPE identities for bundled c-ares and Brotli", () => {
    expect(workflow).toContain("ares: {");
    expect(workflow).toContain(
      'cpe: `cpe:2.3:a:c-ares:c-ares:${version}:*:*:*:*:*:*:*`',
    );
    expect(workflow).toContain("brotli: {");
    expect(workflow).toContain(
      'cpe: `cpe:2.3:a:google:brotli:${version}:*:*:*:*:*:*:*`',
    );
  });

  it("scans each reviewed PURL or CPE directly with the isolated config and retains the raw scanner record", () => {
    expect(workflow).not.toContain('"sbom:$sbom_path"');
    expect(workflow).not.toContain('"$SCANNER_BIN_DIR/grype" --config /dev/null');
    expect(workflow).toContain(
      '"$SCANNER_BIN_DIR/grype" --config "$grype_config" "$identity"',
    );
    expect(workflow).toContain("scanner_output: raw");
  });
});