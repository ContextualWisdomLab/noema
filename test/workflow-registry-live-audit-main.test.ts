import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { main } from "../scripts/workflow-registry-live-audit.mjs";

const REPOSITORY = "ContextualWisdomLab/noema";
const temporaryDirectories: string[] = [];
const originalArgv = process.argv;
const originalExitCode = process.exitCode;

async function temporaryDirectory(prefix: string) {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

async function delegatedTokenFile(directory: string) {
  const path = join(directory, "github-token");
  await writeFile(path, "delegated-token", { encoding: "utf8", mode: 0o600 });
  await chmod(path, 0o600);
  return path;
}

function failureDetail(report: Awaited<ReturnType<typeof main>>) {
  return String(report.failures?.[0]?.detail ?? "");
}

afterEach(async () => {
  process.argv = originalArgv;
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const directory of temporaryDirectories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

describe("workflow registry live-audit executable authority", () => {
  it("rejects a delegated capability path that requires trimming", async () => {
    const directory = await temporaryDirectory("noema-workflow-audit-token-");
    const tokenPath = await delegatedTokenFile(directory);
    vi.stubEnv("PATH", directory);
    vi.stubEnv("GITHUB_REPOSITORY", REPOSITORY);
    vi.stubEnv("NOEMA_MAINTAINER_TOKEN_PATH", ` ${tokenPath} `);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const report = await main();

    expect(report.status).toBe("FAIL");
    expect(failureDetail(report)).toMatch(/token file path.*canonical/i);
  });

  it("rejects a repository identity that requires trimming", async () => {
    const directory = await temporaryDirectory("noema-workflow-audit-repository-");
    const tokenPath = await delegatedTokenFile(directory);
    vi.stubEnv("PATH", directory);
    vi.stubEnv("GITHUB_REPOSITORY", ` ${REPOSITORY} `);
    vi.stubEnv("NOEMA_MAINTAINER_TOKEN_PATH", tokenPath);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const report = await main();

    expect(report.status).toBe("FAIL");
    expect(failureDetail(report)).toMatch(/bound to exact repository ContextualWisdomLab\/noema/i);
  });

  it("rejects BOM-prefixed GitHub CLI JSON before it can become audit authority", async () => {
    const directory = await temporaryDirectory("noema-workflow-audit-bom-");
    const tokenPath = await delegatedTokenFile(directory);
    const ghPath = join(directory, "gh");
    const branchJson = JSON.stringify({ commit: { sha: "a".repeat(40) } });
    await writeFile(
      ghPath,
      `#!/bin/sh\nprintf '\\357\\273\\277${branchJson}'\n`,
      { encoding: "utf8", mode: 0o700 },
    );
    await chmod(ghPath, 0o700);
    vi.stubEnv("PATH", directory);
    vi.stubEnv("GITHUB_REPOSITORY", REPOSITORY);
    vi.stubEnv("NOEMA_MAINTAINER_TOKEN_PATH", tokenPath);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const report = await main();

    expect(report.status).toBe("FAIL");
    expect(failureDetail(report)).toMatch(/invalid JSON/i);
  });
});
