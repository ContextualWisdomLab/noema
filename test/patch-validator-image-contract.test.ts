import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "..");
const dockerfilePath = resolve(repositoryRoot, "Dockerfile.patch-validator");
const packageJsonPath = resolve(repositoryRoot, "package.json");
const ignorefilePath = resolve(
  repositoryRoot,
  "Dockerfile.patch-validator.dockerignore",
);
const obsoleteIgnorefilePath = resolve(
  repositoryRoot,
  ".dockerignore.patch-validator",
);

function readRequiredFile(path: string): string {
  expect(existsSync(path), `${path} must exist`).toBe(true);
  return readFileSync(path, "utf8");
}

describe("patch-validator image contract", () => {
  it("defines a source-pinned, static, shell-free, non-root image with a minimal context", () => {
    const dockerfile = readRequiredFile(dockerfilePath);
    const packageJson = JSON.parse(readRequiredFile(packageJsonPath)) as Record<string, unknown>;
    const ignorefile = readRequiredFile(ignorefilePath);
    const fromLines = dockerfile
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("FROM "));

    expect(fromLines).toEqual([
      "FROM alpine:3.24.1@sha256:79ff19e9084a00eece421b2523fb93e22d730e2c0e525905de047e848e56d95f AS node_builder",
      "FROM node_builder AS dependencies",
      "FROM scratch AS runtime",
    ]);
    expect(fromLines[0]).toMatch(/@sha256:[0-9a-f]{64}(?:\s|$)/);

    expect(dockerfile).toContain("ARG NODE_VERSION=24.19.0");
    expect(dockerfile).toContain(
      "ARG NODE_SOURCE_SHA256=f6d95e10a0431ee1067fc6aabe9f762908b4716dd35324e1ddb4b1466b76659f",
    );
    expect(dockerfile).toContain("--fully-static");
    expect(dockerfile).not.toContain("--without-npm");
    expect(dockerfile).toContain("--without-corepack");
    expect(dockerfile).toContain("WORKDIR /usr/src/node");
    expect(dockerfile).not.toContain("&& cd /usr/src/node");
    expect(dockerfile).toContain(
      'test "$(/opt/node/bin/npm --version)" = "11.17.0"',
    );
    expect(dockerfile).toContain("readelf -l /opt/node/bin/node");
    expect(dockerfile).toContain("readelf -d /opt/node/bin/node");

    expect(dockerfile).toContain("COPY package.json package-lock.json ./");
    expect(dockerfile).toContain(
      "npm ci --include=optional --ignore-scripts --no-audit --no-fund",
    );
    expect(dockerfile).toContain("node_modules/typescript/bin/tsc");
    expect(dockerfile).toContain("node_modules/vitest/vitest.mjs");
    expect(dockerfile).toContain("node_modules/@vitest/coverage-v8/package.json");
    expect(dockerfile).toContain("node_modules/@rolldown/binding-wasm32-wasi/package.json");

    const runtimeStage = dockerfile.slice(dockerfile.indexOf(fromLines[2]));
    expect(runtimeStage).not.toMatch(/^RUN\b/m);
    expect(runtimeStage).not.toMatch(/^ADD\b/m);
    expect(runtimeStage).not.toContain("COPY . ");
    expect(runtimeStage).not.toContain("/opt/node/bin/npm");
    expect(runtimeStage).toContain("ENV NAPI_RS_FORCE_WASI=error");
    expect(runtimeStage).toContain("USER 65532:65532");
    expect(runtimeStage).toContain("WORKDIR /workspace");
    expect(runtimeStage).toContain(
      'ENTRYPOINT ["/nodejs/bin/node", "--input-type=module", "--eval", "import { runCli } from \'/opt/noema/runtime.mjs\'; import { runEntrypoint } from \'/opt/noema/entrypoint.mjs\'; process.exitCode = runEntrypoint({ runCliImpl: runCli, writeDiagnostic: (message) => process.stderr.write(message) });"]',
    );
    expect(runtimeStage).toContain(
      "COPY --from=node_builder --chown=65532:65532 /opt/node/bin/node /nodejs/bin/node",
    );
    expect(runtimeStage).toContain(
      "COPY --from=node_builder --chown=65532:65532 --chmod=0444 /usr/src/node/LICENSE /licenses/node/LICENSE",
    );
    expect(runtimeStage).toContain(
      "COPY --from=dependencies --chown=65532:65532 /build/node_modules /opt/noema/node_modules",
    );
    expect(runtimeStage).toContain(
      "COPY --chown=65532:65532 patch-validator/entrypoint.mjs /opt/noema/entrypoint.mjs",
    );
    expect(runtimeStage).toContain(
      "COPY --chown=65532:65532 patch-validator/validate-patch.mjs /opt/noema/validate-patch.mjs",
    );
    expect(runtimeStage).toContain(
      "COPY --chown=65532:65532 patch-validator/runtime.mjs /opt/noema/runtime.mjs",
    );
    expect(runtimeStage).toContain(
      "COPY --chown=65532:65532 patch-validator/validator-tsconfig.json /opt/noema/validator-tsconfig.json",
    );
    expect(runtimeStage).toContain(
      "COPY --chown=65532:65532 patch-validator/validator-vitest.config.mjs /opt/noema/validator-vitest.config.mjs",
    );

    expect(runtimeStage).toContain(
      'org.opencontainers.image.source="https://github.com/ContextualWisdomLab/noema"',
    );
    expect(runtimeStage).toContain('org.opencontainers.image.revision="${SOURCE_REVISION}"');
    expect(packageJson.private).toBe(true);
    expect(packageJson).not.toHaveProperty("license");
    expect(runtimeStage).not.toContain("org.opencontainers.image.licenses=");
    expect(runtimeStage).toContain('org.opencontainers.image.title="Noema Patch Validator"');
    expect(runtimeStage).toContain(
      'org.opencontainers.image.documentation="https://github.com/ContextualWisdomLab/noema/blob/main/docs/patch-validator-image.md"',
    );

    const argumentAndEnvironmentLines = dockerfile
      .split("\n")
      .filter((line) => /^(?:ARG|ENV)\b/.test(line.trim()));
    expect(argumentAndEnvironmentLines.join("\n")).not.toMatch(
      /(token|secret|password|credential|private[_-]?key|github|nvidia|cloudflare)/i,
    );

    const ignoreEntries = ignorefile
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
    expect(ignoreEntries).toEqual([
      "*",
      "!package.json",
      "!package-lock.json",
      "!patch-validator/",
      "patch-validator/*",
      "!patch-validator/entrypoint.mjs",
      "!patch-validator/validate-patch.mjs",
      "!patch-validator/runtime.mjs",
      "!patch-validator/validator-tsconfig.json",
      "!patch-validator/validator-vitest.config.mjs",
    ]);
    expect(existsSync(obsoleteIgnorefilePath)).toBe(false);
  });

  it("removes Worker-only tooling and native addons before copying runtime dependencies", () => {
    const dockerfile = readRequiredFile(dockerfilePath);

    expect(dockerfile).toContain("npm_config_os=wasip1-threads");
    expect(dockerfile).toContain("npm_config_cpu=wasm32");
    expect(dockerfile).toContain(
      "npm pkg delete devDependencies.@cloudflare/workers-types devDependencies.wrangler",
    );
    expect(dockerfile).toContain(
      "npm prune --include=optional --ignore-scripts --no-audit --no-fund",
    );
    expect(dockerfile).toContain(
      'test -z "$(find node_modules -type f -name \'*.node\' -print -quit)"',
    );
    expect(dockerfile).toContain("test ! -e node_modules/@cloudflare/workers-types");
    expect(dockerfile).toContain("test ! -e node_modules/wrangler");
    expect(dockerfile).toContain("test ! -e node_modules/workerd");
    expect(dockerfile).toContain("test ! -e node_modules/miniflare");
  });
});
