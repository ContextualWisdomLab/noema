import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "..");
const dockerfilePath = resolve(repositoryRoot, "Dockerfile.patch-validator");
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
  it("defines a digest-pinned, shell-free, non-root image with a minimal context", () => {
    const dockerfile = readRequiredFile(dockerfilePath);
    const ignorefile = readRequiredFile(ignorefilePath);
    const fromLines = dockerfile
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("FROM "));

    expect(fromLines).toEqual([
      "FROM node:24.16.0-bookworm-slim@sha256:2c87ef9bd3c6a3bd4b472b4bec2ce9d16354b0c574f736c476489d09f560a203 AS dependencies",
      "FROM gcr.io/distroless/nodejs24-debian13@sha256:fbbdda866ea71aef98c4abece17e3d61fbf820cc2ef3961522caa2478716171a AS runtime",
    ]);
    expect(fromLines.every((line) => /@sha256:[0-9a-f]{64}(?:\s|$)/.test(line))).toBe(
      true,
    );

    expect(dockerfile).toContain("COPY package.json package-lock.json ./");
    expect(dockerfile).toContain("npm ci --ignore-scripts --no-audit --no-fund");
    expect(dockerfile).toContain("node_modules/typescript/bin/tsc");
    expect(dockerfile).toContain("node_modules/vitest/vitest.mjs");
    expect(dockerfile).toContain("node_modules/@vitest/coverage-v8/package.json");

    const runtimeStage = dockerfile.slice(dockerfile.indexOf(fromLines[1]));
    expect(runtimeStage).not.toMatch(/^RUN\b/m);
    expect(runtimeStage).not.toMatch(/^ADD\b/m);
    expect(runtimeStage).not.toContain("COPY . ");
    expect(runtimeStage).toContain("USER 65532:65532");
    expect(runtimeStage).toContain("WORKDIR /workspace");
    expect(runtimeStage).toContain(
      'ENTRYPOINT ["/nodejs/bin/node", "--input-type=module", "--eval", "import { runCli } from \'/opt/noema/validate-patch.mjs\'; const result = runCli(); if (result.status !== \'passed\') process.exitCode = Number.isInteger(result.exit_code) && result.exit_code > 0 ? result.exit_code : 1;"]',
    );
    expect(runtimeStage).toContain(
      "COPY --from=dependencies --chown=65532:65532 /build/node_modules /opt/noema/node_modules",
    );
    expect(runtimeStage).toContain(
      "COPY --chown=65532:65532 patch-validator/validate-patch.mjs /opt/noema/validate-patch.mjs",
    );

    expect(runtimeStage).toContain(
      'org.opencontainers.image.source="https://github.com/ContextualWisdomLab/noema"',
    );
    expect(runtimeStage).toContain('org.opencontainers.image.revision="${SOURCE_REVISION}"');
    expect(runtimeStage).toContain('org.opencontainers.image.licenses="LicenseRef-Proprietary"');
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
      "!patch-validator/validate-patch.mjs",
    ]);
    expect(existsSync(obsoleteIgnorefilePath)).toBe(false);
  });
});
