import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dockerfile = readFileSync("Dockerfile.patch-validator", "utf8");
const imageWorkflow = readFileSync(".github/workflows/patch-validator-image.yml", "utf8");

describe("patch-validator exact-toolchain image build regression", () => {
  it("builds the static runtime with the exact Node/npm toolchain declared by devEngines", () => {
    expect(dockerfile).toContain("ARG NODE_VERSION=24.19.0");
    expect(dockerfile).toContain('test "$(/opt/node/bin/npm --version)" = "11.17.0"');
    expect(dockerfile).not.toContain("FROM validator_deps");
    expect(dockerfile).not.toContain("FROM node:24.18.0-alpine3.24");
    expect(dockerfile).not.toContain("--without-npm");

    const runtimeStage = dockerfile.slice(dockerfile.indexOf("FROM scratch AS runtime"));
    expect(runtimeStage).toContain(
      "COPY --from=node_builder --chown=65532:65532 /opt/node/bin/node /nodejs/bin/node",
    );
    expect(runtimeStage).toContain(
      "COPY --from=validator_deps --chown=65532:65532 /node_modules /opt/noema/node_modules",
    );
    expect(runtimeStage).not.toContain("/opt/node/bin/npm");
  });

  it("materializes lockfile dependencies before Docker and forbids npm registry access in the image build", () => {
    expect(imageWorkflow).toContain("Set up exact dependency materialization toolchain");
    expect(imageWorkflow).toContain("Materialize exact patch-validator dependencies");
    expect(imageWorkflow).toContain('node-version: "24.19.0"');
    expect(imageWorkflow).toContain('test "$(npm --version)" = "11.17.0"');
    expect(imageWorkflow).toContain("npm ci --include=optional --ignore-scripts --no-audit --no-fund");
    expect(imageWorkflow).toContain('--build-context "validator_deps=${VALIDATOR_DEPS_CONTEXT}"');
    expect(dockerfile).toContain(
      "COPY --from=validator_deps --chown=65532:65532 /node_modules /opt/noema/node_modules",
    );
    expect(dockerfile).not.toContain("FROM validator_deps");
    expect(dockerfile).not.toContain("npm ci");
    expect(dockerfile).not.toContain("npm prune");
  });

  it("materializes checksum-pinned runtime source archives before Docker instead of granting the image build source-download authority", () => {
    expect(imageWorkflow).toContain("Materialize checksum-pinned patch-validator runtime sources");
    expect(imageWorkflow).toContain("node-v${NODE_VERSION}.tar.xz");
    expect(imageWorkflow).toContain("openssl-${OPENSSL_VERSION}.tar.gz");
    expect(imageWorkflow).toContain("NODE_SOURCE_SHA256");
    expect(imageWorkflow).toContain("OPENSSL_SOURCE_SHA256");
    expect(imageWorkflow).toContain('--build-context "node_source=${NODE_SOURCE_CONTEXT}"');
    expect(imageWorkflow).toContain('--build-context "openssl_source=${OPENSSL_SOURCE_CONTEXT}"');
    expect(dockerfile).toContain("COPY --from=node_source /node.tar.xz /tmp/node.tar.xz");
    expect(dockerfile).toContain("COPY --from=openssl_source /openssl.tar.gz /tmp/openssl.tar.gz");
    expect(dockerfile).not.toContain("ADD --checksum");
    expect(dockerfile).not.toContain("https://nodejs.org/");
    expect(dockerfile).not.toContain("https://github.com/openssl/");
  });

  it("keeps the freshly installed Node executable on PATH while the Node make install installs npm", () => {
    const nodeBuilderStage = dockerfile.slice(
      dockerfile.indexOf("FROM alpine:3.24.1"),
      dockerfile.indexOf("FROM scratch AS runtime"),
    );
    const nodeBuild = nodeBuilderStage.slice(nodeBuilderStage.indexOf("WORKDIR /usr/src/node"));

    expect(nodeBuilderStage).toContain('ENV PATH="/opt/node/bin:${PATH}"');
    expect(nodeBuild).toContain("./configure");
    expect(nodeBuild).toContain("&& make install");
    expect(nodeBuilderStage.indexOf('ENV PATH="/opt/node/bin:${PATH}"')).toBeLessThan(
      nodeBuilderStage.indexOf("WORKDIR /usr/src/node"),
    );
  });

  it("installs the static GCC runtime archive before requesting a fully static Node binary", () => {
    const nodeBuilderStage = dockerfile.slice(
      dockerfile.indexOf("FROM alpine:3.24.1"),
      dockerfile.indexOf("FROM scratch AS runtime"),
    );

    expect(nodeBuilderStage).toContain("--fully-static");
    expect(nodeBuilderStage).toContain("libgcc-static");
    expect(nodeBuilderStage.indexOf("libgcc-static")).toBeLessThan(
      nodeBuilderStage.indexOf("--fully-static"),
    );
  });

  it("keeps the Unicode property-escape smoke probe intact across the shell boundary", () => {
    const nodeBuilderStage = dockerfile.slice(
      dockerfile.indexOf("FROM alpine:3.24.1"),
      dockerfile.indexOf("FROM scratch AS runtime"),
    );
    const unicodePropertyProbe = `--eval='/\\p{ID_Continue}/u.test("a")'`;

    expect(nodeBuilderStage.split(unicodePropertyProbe)).toHaveLength(3);
    expect(nodeBuilderStage).not.toContain(
      `--eval="new RegExp('\\\\p{ID_Continue}', 'u')"`,
    );
  });

  it("uses Docker WORKDIR instead of shell cd for the Node source build", () => {
    expect(dockerfile).toContain("WORKDIR /usr/src/node");
    expect(dockerfile).not.toContain("&& cd /usr/src/node");
  });
});
