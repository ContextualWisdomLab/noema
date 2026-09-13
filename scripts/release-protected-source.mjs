#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const EXPECTED_REPOSITORY = "ContextualWisdomLab/noema";
const PROTECTED_MAIN_REF = "refs/heads/main";
const RELEASE_TAG_REF_PATTERN = /^refs\/tags\/v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/;
const LS_REMOTE_MAX_BYTES = 16 * 1024;
const LS_REMOTE_TIMEOUT_MS = 20_000;

function fail(message) {
  throw new Error(message);
}

function requireCanonicalSha(value, label) {
  if (typeof value !== "string" || !FULL_SHA_PATTERN.test(value)) {
    fail(`${label} must be a canonical lowercase full Git SHA.`);
  }
  return value;
}

export function parseProtectedMainLsRemote(stdout) {
  if (typeof stdout !== "string") {
    fail("protected main ls-remote output must be text.");
  }
  if (Buffer.byteLength(stdout, "utf8") > LS_REMOTE_MAX_BYTES) {
    fail("protected main ls-remote output exceeded the admission ceiling.");
  }

  const records = stdout
    .split("\n")
    .filter((line) => line.length > 0);
  if (records.length !== 1) {
    fail(`protected main ls-remote must return exactly one record; observed ${records.length}.`);
  }

  const fields = records[0].split("\t");
  if (fields.length !== 2 || fields[1] !== PROTECTED_MAIN_REF) {
    fail("protected main ls-remote record has an unexpected shape or ref.");
  }
  return requireCanonicalSha(fields[0], "protected main SHA");
}

function resolveProtectedMainShaFromGit() {
  const completed = spawnSync(
    "git",
    ["ls-remote", "--refs", "origin", PROTECTED_MAIN_REF],
    {
      shell: false,
      encoding: "utf8",
      env: {
        PATH: process.env.PATH ?? "",
        GIT_TERMINAL_PROMPT: "0",
        LC_ALL: "C",
      },
      maxBuffer: LS_REMOTE_MAX_BYTES,
      timeout: LS_REMOTE_TIMEOUT_MS,
    },
  );

  if (completed.error) {
    fail("protected main could not be resolved from the canonical origin.");
  }
  if (completed.status !== 0) {
    fail(`protected main resolution failed with exit status ${completed.status ?? "unknown"}.`);
  }
  return parseProtectedMainLsRemote(completed.stdout);
}

function explicitOrFallback(env, explicitName, fallbackName) {
  return Object.prototype.hasOwnProperty.call(env, explicitName)
    ? env[explicitName]
    : env[fallbackName];
}

export function verifyReleaseProtectedSource({
  env = process.env,
  resolveProtectedMainSha = resolveProtectedMainShaFromGit,
} = {}) {
  const releaseRef = env.GITHUB_REF;
  if (env.GITHUB_ACTIONS !== "true" || typeof releaseRef !== "string" || !RELEASE_TAG_REF_PATTERN.test(releaseRef)) {
    return { status: "SKIPPED", reason: "not_release_tag_actions_context" };
  }

  if (env.GITHUB_REPOSITORY !== EXPECTED_REPOSITORY) {
    fail(`release repository must be ${EXPECTED_REPOSITORY}.`);
  }

  const releaseCommitSha = requireCanonicalSha(
    explicitOrFallback(env, "NOEMA_RELEASE_COMMIT_SHA", "GITHUB_SHA"),
    "release commit SHA",
  );
  const protectedMainSha = requireCanonicalSha(
    resolveProtectedMainSha(),
    "protected main SHA",
  );

  if (releaseCommitSha !== protectedMainSha) {
    fail(
      `release commit ${releaseCommitSha} does not equal current protected main ${protectedMainSha}.`,
    );
  }

  return {
    status: "PASS",
    repository: EXPECTED_REPOSITORY,
    releaseCommitSha,
    protectedMainSha,
  };
}

function main() {
  try {
    const result = verifyReleaseProtectedSource();
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
