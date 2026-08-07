import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const dockerfile = readFileSync("Dockerfile.patch-validator", "utf8");
const workflow = readFileSync(
  ".github/workflows/patch-validator-image.yml",
  "utf8",
);

const alpineBuilder =
  "alpine:3.24.1@sha256:79ff19e9084a00eece421b2523fb93e22d730e2c0e525905de047e848e56d95f";
const nodeSourceSha256 =
  "f6d95e10a0431ee1067fc6aabe9f762908b4716dd35324e1ddb4b1466b76659f";

describe("patch-validator static scratch runtime", () => {
  it("builds the runtime from the checksum-pinned current Node 24 source", () => {
    expect(dockerfile).toContain(`FROM ${alpineBuilder} AS node_builder`);
    expect(dockerfile).toContain("ARG NODE_VERSION=24.19.0");
    expect(dockerfile).toContain(`ARG NODE_SOURCE_SHA256=${nodeSourceSha256}`);
    expect(dockerfile).toContain(
      "ADD --checksum=sha256:${NODE_SOURCE_SHA256} https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}.tar.xz /tmp/node.tar.xz",
    );
    expect(dockerfile).toContain("--fully-static");
    expect(dockerfile).toContain("--with-intl=none");
    expect(dockerfile).toContain("--without-npm");
    expect(dockerfile).toContain("--without-corepack");
    expect(dockerfile).toContain(
      "test \"$(/opt/node/bin/node --version)\" = \"v${NODE_VERSION}\"",
    );
    expect(dockerfile).toContain("readelf -l /opt/node/bin/node");
    expect(dockerfile).toContain("readelf -d /opt/node/bin/node");
  });

  it("ships only the static runtime and approved validator payload in scratch", () => {
    expect(dockerfile).toContain("FROM scratch AS runtime");
    expect(dockerfile).toContain(
      "COPY --from=node_builder --chown=65532:65532 /opt/node/bin/node /nodejs/bin/node",
    );
    expect(dockerfile).toContain("USER 65532:65532");
    expect(dockerfile).not.toContain("gcr.io/distroless");
    expect(dockerfile).not.toContain("debian13");
  });

  it("verifies the repository-built runtime without external base-image trust claims", () => {
    expect(workflow).not.toContain("DISTROLESS_IMAGE");
    expect(workflow).not.toContain("sigstore/cosign-installer");
    expect(workflow).not.toContain("cosign verify");
    expect(workflow).not.toContain("keyless@distroless.iam.gserviceaccount.com");
    expect(workflow).toContain("Verify static Node runtime identity");
    expect(workflow).toContain(
      'test "$(docker run --rm --pull=never "$IMAGE_TAG" --version)" = "v24.19.0"',
    );
    expect(workflow).toContain("--severity MEDIUM,HIGH,CRITICAL");
    expect(workflow).toContain("--exit-code 1");
  });
});
