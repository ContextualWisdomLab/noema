import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readDelegatedGithubToken } from "../scripts/lib/delegated-github-token.mjs";
import {
  readDelegatedGithubToken as readMaintainerAppDelegatedGithubToken,
} from "../scripts/maintainer-app-readiness.mjs";

const temporaryDirectories: string[] = [];
const MAX_DELEGATED_TOKEN_BYTES = 16 * 1024;
const delegatedCredentialScripts = [
  "scripts/actions-runner-assignment-audit.mjs",
  "scripts/hourly-commercial-readiness.mjs",
  "scripts/main-governance-audit.mjs",
  "scripts/maintainer-app-readiness.mjs",
  "scripts/production-environment-governance-audit.mjs",
  "scripts/workflow-registry-live-audit.mjs",
  "scripts/workflow-registry-live-disable.mjs",
];

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "noema-token-capability-"));
  temporaryDirectories.push(directory);
  return directory;
}

function temporaryFile(contents: string, mode = 0o600) {
  const directory = temporaryDirectory();
  const path = join(directory, "token");
  writeFileSync(path, contents, { encoding: "utf8", mode: 0o600 });
  chmodSync(path, mode);
  return path;
}

function stepBlock(workflow: string, name: string) {
  const start = workflow.indexOf(name);
  const nextStep = workflow.indexOf("\n      - name:", start + 1);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(nextStep).toBeGreaterThan(start);
  return workflow.slice(start, nextStep);
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("GitHub credential capability ingress", () => {
  it("reads a non-empty control-free delegated token from an owner-only capability file", () => {
    const path = temporaryFile("delegated-token-value");
    expect(readDelegatedGithubToken(path)).toBe("delegated-token-value");
  });

  it("fails closed for missing, unreadable, empty, and control-bearing capability files", () => {
    expect(() => readDelegatedGithubToken("")).toThrow("Maintainer token file path is required.");
    expect(() => readDelegatedGithubToken("/definitely/not/a/noema/token")).toThrow(
      "Maintainer token capability parent directories could not be verified.",
    );
    expect(() => readDelegatedGithubToken(temporaryFile(""))).toThrow(
      "Maintainer token file must not be empty.",
    );
    expect(() => readDelegatedGithubToken(temporaryFile("token\nvalue"))).toThrow(
      "Maintainer token must not contain control characters.",
    );
  });

  it("redacts fine-grained GitHub credentials if a verified-parent path reaches an open failure", () => {
    const credential = "github_pat_11AA_exampleSensitiveValue";
    const directory = temporaryDirectory();
    const missingCredentialPath = join(directory, credential);
    let failure: Error | undefined;
    try {
      readDelegatedGithubToken(missingCredentialPath);
    } catch (error) {
      failure = error as Error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect(failure?.message).toContain("Maintainer token file could not be opened safely:");
    expect(failure?.message).toContain("[REDACTED]");
    expect(failure?.message).not.toContain(credential);
  });

  it("rejects group/world-readable delegated credential files", () => {
    for (const mode of [0o640, 0o604, 0o666]) {
      const path = temporaryFile("delegated-token-value", mode);
      expect(() => readDelegatedGithubToken(path)).toThrow(
        "Maintainer token file permissions must be owner-only.",
      );
    }
  });

  it("rejects symlink and non-regular-file capability paths", () => {
    const directory = temporaryDirectory();
    const target = join(directory, "real-token");
    const link = join(directory, "token-link");
    const nestedDirectory = join(directory, "token-directory");
    writeFileSync(target, "delegated-token-value", { encoding: "utf8", mode: 0o600 });
    symlinkSync(target, link);
    mkdirSync(nestedDirectory, { mode: 0o700 });

    expect(() => readDelegatedGithubToken(link)).toThrow(
      "Maintainer token file could not be opened safely:",
    );
    expect(() => readDelegatedGithubToken(nestedDirectory)).toThrow(
      "Maintainer token capability must be a regular file.",
    );
  });

  it("applies the hardened capability-file contract to maintainer-app readiness", () => {
    for (const mode of [0o640, 0o604, 0o666]) {
      const path = temporaryFile("delegated-token-value", mode);
      expect(() => readMaintainerAppDelegatedGithubToken(path)).toThrow(
        "Maintainer token file permissions must be owner-only.",
      );
    }

    const directory = temporaryDirectory();
    const target = join(directory, "real-token");
    const link = join(directory, "maintainer-token-link");
    writeFileSync(target, "delegated-token-value", { encoding: "utf8", mode: 0o600 });
    symlinkSync(target, link);
    expect(() => readMaintainerAppDelegatedGithubToken(link)).toThrow(
      "Maintainer token file could not be opened safely:",
    );
  });

  it("bounds delegated token bytes before parsing secret content", () => {
    const path = temporaryFile("x".repeat(MAX_DELEGATED_TOKEN_BYTES + 1));
    expect(() => readDelegatedGithubToken(path)).toThrow(
      "Maintainer token file exceeds the bounded size limit.",
    );
  });

  it("keeps every delegated GitHub bearer consumer out of Node process-environment reads", () => {
    for (const scriptPath of delegatedCredentialScripts) {
      const script = readFileSync(scriptPath, "utf8");
      expect(script).toContain("NOEMA_MAINTAINER_TOKEN_PATH");
      expect(script).toContain("readDelegatedGithubToken");
      expect(script).not.toContain("process.env.GH_TOKEN");
    }
  });

  it("documents short-lived GitHub App bootstrap into an owner-only capability file", () => {
    const agents = readFileSync("AGENTS.md", "utf8");
    expect(agents).toContain("short-lived GitHub App installation token");
    expect(agents).toContain("owner-only capability file");
    expect(agents).toContain("bootstrap transport");
    expect(agents).toContain("runtime script reads only the capability-file path");
    expect(agents).not.toContain(
      "If any script ever needs a real secret, source it from the KV, not the environment.",
    );
  });

  it("bootstraps every maintainer-token caller through a fresh private capability directory", () => {
    const workflowCases = [
      {
        path: ".github/workflows/hourly-commercial-readiness.yml",
        steps: ["verify active main governance before any write", "inspect, dispatch, and merge exact-head pull requests"],
      },
      {
        path: ".github/workflows/maintainer-app-readiness.yml",
        steps: [
          "audit active main governance",
          "audit effective Maintainer App identity and access",
          "inspect commercial-readiness loop without writes",
        ],
      },
    ];

    for (const workflowCase of workflowCases) {
      const workflow = readFileSync(workflowCase.path, "utf8");
      for (const stepName of workflowCase.steps) {
        const block = stepBlock(workflow, stepName);
        const umaskIndex = block.indexOf("umask 077");
        const mktempIndex = block.indexOf(
          'token_dir="$(mktemp -d "$RUNNER_TEMP/noema-token-capability.XXXXXX")"',
        );

        expect(block).toContain("DELEGATED_MAINTAINER_TOKEN: ${{ steps.maintainer_app.outputs.token }}");
        expect(block).toContain("NOEMA_MAINTAINER_TOKEN_PATH");
        expect(umaskIndex).toBeGreaterThan(-1);
        expect(mktempIndex).toBeGreaterThan(umaskIndex);
        expect(block).toContain("unset DELEGATED_MAINTAINER_TOKEN");
        expect(block).toContain("trap 'rm -rf \"$token_dir\"' EXIT");
        expect(block).not.toContain('mkdir -p "$token_dir"');
        expect(block).not.toContain("trap 'rm -f \"$token_path\"' EXIT");
        expect(block).not.toContain("GH_TOKEN: ${{ steps.maintainer_app.outputs.token }}");
      }
    }
  });
});