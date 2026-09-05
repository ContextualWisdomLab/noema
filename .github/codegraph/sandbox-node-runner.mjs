#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import {
  BUNDLED_CODEGRAPH_ENTRYPOINT,
  BUNDLED_CODEGRAPH_NODE,
  MAX_CHANGED_SCOPE_CHARS,
  copyInputTree,
  runBoundedCommand,
} from "./sandbox-runner.mjs";

function boundedDiagnostic(output, maximum = 1000) {
  const compact = String(output).trim() || "no diagnostic output";
  if (compact.length <= maximum) {
    return compact;
  }
  return `${compact.slice(0, maximum)} [truncated ${compact.length - maximum} characters]`;
}

export function validateRepositoryRelativePath(rawPath) {
  if (typeof rawPath !== "string" || rawPath.length === 0) {
    throw new Error("CodeGraph node path is required");
  }
  if (rawPath.includes("\0")) {
    throw new Error("CodeGraph node path must not contain NUL characters");
  }
  if (Array.from(rawPath).length > MAX_CHANGED_SCOPE_CHARS) {
    throw new Error("CodeGraph node path exceeds the bounded input contract");
  }
  if (rawPath.startsWith("/") || rawPath.startsWith("\\")) {
    throw new Error("CodeGraph node path must be repository-relative");
  }
  const parts = rawPath.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    throw new Error("CodeGraph node path must not traverse repository boundaries");
  }
  return rawPath;
}

export async function runCodeGraphNode(rawPath) {
  const relativePath = validateRepositoryRelativePath(rawPath);
  const projectRoot = "/workspace/project";
  await copyInputTree("/input", projectRoot);
  const environment = {
    PATH: "/usr/local/bin:/usr/bin:/bin",
    HOME: "/workspace/home",
    XDG_CACHE_HOME: "/workspace/cache",
    CODEGRAPH_NO_UPDATE_CHECK: "1",
    CODEGRAPH_HOST_PPID: String(process.ppid),
    DO_NOT_TRACK: "1",
    NO_COLOR: "1",
  };
  const runtimeFlags = [
    "--liftoff-only",
    "--disable-warning=ExperimentalWarning",
    BUNDLED_CODEGRAPH_ENTRYPOINT,
  ];

  for (const args of [["init", "-i"], ["sync"]]) {
    await runBoundedCommand(
      BUNDLED_CODEGRAPH_NODE,
      [...runtimeFlags, ...args],
      { cwd: projectRoot, env: environment },
    );
  }
  return runBoundedCommand(
    BUNDLED_CODEGRAPH_NODE,
    [...runtimeFlags, "node", "--file", relativePath, "--symbols-only"],
    { cwd: projectRoot, env: environment },
  );
}

async function main() {
  try {
    const output = await runCodeGraphNode(process.argv[2] ?? "");
    process.stdout.write(output);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`sandbox_error: ${boundedDiagnostic(message)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
