import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const dockerfile = readFileSync("Dockerfile.patch-validator", "utf8");

const OPENSSL_3_5_8_SHA256 =
  "a8f84a39918ec6415ce765d9b429d313ba97b8143169c172e734b9514464f5b2";

describe("patch-validator static OpenSSL security floor", () => {
  it("builds the static Node runtime against checksum-pinned OpenSSL 3.5.8 or newer instead of the vulnerable Node-bundled 3.5.7", () => {
    expect(dockerfile).toContain("ARG OPENSSL_VERSION=3.5.8");
    expect(dockerfile).toContain(
      `ARG OPENSSL_SOURCE_SHA256=${OPENSSL_3_5_8_SHA256}`,
    );
    expect(dockerfile).toContain(
      "https://github.com/openssl/openssl/releases/download/openssl-${OPENSSL_VERSION}/openssl-${OPENSSL_VERSION}.tar.gz",
    );
    expect(dockerfile).toContain("--shared-openssl");
    expect(dockerfile).toContain("--shared-openssl-includes=/opt/openssl/include");
    expect(dockerfile).toContain("--shared-openssl-libpath=/opt/openssl/lib");
    expect(dockerfile).toContain(
      "process.versions.openssl !== process.env.OPENSSL_VERSION",
    );
    expect(dockerfile).not.toContain("ARG OPENSSL_VERSION=3.5.7");
  });
});
