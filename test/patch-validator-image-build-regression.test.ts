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

  it("bounds checksum-pinned runtime source downloads instead of granting remote ADD the full image-build deadline", () => {
    expect(dockerfile).toContain("curl --fail --location --proto '=https' --proto-redir '=https' --tlsv1.2");
    expect(dockerfile).toContain("--connect-timeout 20");
    expect(dockerfile).toContain("--max-time 180");
    expect(dockerfile).toContain("timeout --signal=TERM --kill-after=30s 5m");
    expect(dockerfile).toContain("node-v${NODE_VERSION}.tar.xz");
    expect(dockerfile).toContain("openssl-${OPENSSL_VERSION}.tar.gz");
    expect(dockerfile).toContain("NODE_SOURCE_SHA256");
    expect(dockerfile).toContain("OPENSSL_SOURCE_SHA256");
    expect(dockerfile).toContain("sha256sum");
    expect(dockerfile).not.toContain("ADD --checksum");
  });

  it("bounds checksum-pinned scanner asset downloads before granting them image verification authority", () => {
    const scannerStepStart = imageWorkflow.indexOf("- name: Install checksum-pinned Syft and Grype");
    const scannerStepEnd = imageWorkflow.indexOf(
      "- name: Set up exact dependency materialization toolchain",
      scannerStepStart,
    );
    const scannerStep = imageWorkflow.slice(scannerStepStart, scannerStepEnd);

    expect(scannerStepStart).toBeGreaterThanOrEqual(0);
    expect(scannerStepEnd).toBeGreaterThan(scannerStepStart);
    expect(scannerStep).toContain("timeout --signal=TERM --kill-after=30s 5m");
    expect(scannerStep).toContain("--proto '=https'");
    expect(scannerStep).toContain("--proto-redir '=https'");
    expect(scannerStep).toContain("--connect-timeout 20");
    expect(scannerStep).toContain("--max-time 180");
    expect(scannerStep).toContain("--retry-max-time 90");
    expect(scannerStep).toContain("sha256sum --check --strict");
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