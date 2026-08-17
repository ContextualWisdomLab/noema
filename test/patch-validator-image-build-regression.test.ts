import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dockerfile = readFileSync("Dockerfile.patch-validator", "utf8");

describe("patch-validator exact-toolchain image build regression", () => {
  it("builds dependencies with the exact Node/npm toolchain declared by devEngines", () => {
    expect(dockerfile).toContain("ARG NODE_VERSION=24.19.0");
    expect(dockerfile).toContain('test "$(/opt/node/bin/npm --version)" = "11.17.0"');
    expect(dockerfile).toContain("FROM node_builder AS dependencies");
    expect(dockerfile).not.toContain("FROM node:24.18.0-alpine3.24");
    expect(dockerfile).not.toContain("--without-npm");

    const runtimeStage = dockerfile.slice(dockerfile.indexOf("FROM scratch AS runtime"));
    expect(runtimeStage).toContain(
      "COPY --from=node_builder --chown=65532:65532 /opt/node/bin/node /nodejs/bin/node",
    );
    expect(runtimeStage).not.toContain("/opt/node/bin/npm");
  });

  it("uses Docker WORKDIR instead of shell cd for the Node source build", () => {
    expect(dockerfile).toContain("WORKDIR /usr/src/node");
    expect(dockerfile).not.toContain("&& cd /usr/src/node");
  });
});
