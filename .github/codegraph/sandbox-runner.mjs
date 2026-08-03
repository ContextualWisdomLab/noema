#!/usr/bin/env node
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  readdir,
} from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

export const DEFAULT_INPUT_LIMITS = Object.freeze({
  maxFiles: 20_000,
  maxFileBytes: 8 * 1024 * 1024,
  maxTotalBytes: 200 * 1024 * 1024,
});
export const MAX_CHANGED_PATHS = 80;
export const MAX_CHANGED_PATH_CHARS = 300;
export const COMMAND_TIMEOUT_MS = 180_000;
export const COMMAND_OUTPUT_LIMIT_BYTES = 128 * 1024;
export const SESSION_OUTPUT_LIMIT_BYTES = 256 * 1024;

function quotaError(name, observed, maximum) {
  return new Error(`CodeGraph sandbox ${name} quota exceeded: ${observed} > ${maximum}`);
}

export async function copyInputTree(inputRoot, outputRoot, limits = DEFAULT_INPUT_LIMITS) {
  const rootStat = await lstat(inputRoot);
  if (!rootStat.isDirectory()) {
    throw new Error(`CodeGraph sandbox input root must be a directory: ${inputRoot}`);
  }

  let files = 0;
  let totalBytes = 0;
  await mkdir(outputRoot, { recursive: true, mode: 0o700 });

  async function copyEntry(sourcePath, destinationPath, entryName) {
    if (entryName === ".git") {
      return;
    }
    const stat = await lstat(sourcePath);
    if (stat.isSymbolicLink()) {
      throw new Error(`CodeGraph sandbox refuses symbolic link: ${sourcePath}`);
    }
    if (stat.isDirectory()) {
      await mkdir(destinationPath, { recursive: true, mode: 0o700 });
      const entries = await readdir(sourcePath, { withFileTypes: true });
      entries.sort((left, right) => left.name.localeCompare(right.name));
      for (const entry of entries) {
        await copyEntry(
          join(sourcePath, entry.name),
          join(destinationPath, entry.name),
          entry.name,
        );
      }
      return;
    }
    if (!stat.isFile()) {
      throw new Error(`CodeGraph sandbox refuses non-regular input: ${sourcePath}`);
    }

    files += 1;
    if (files > limits.maxFiles) {
      throw quotaError("file-count", files, limits.maxFiles);
    }
    if (stat.size > limits.maxFileBytes) {
      throw quotaError("per-file byte", stat.size, limits.maxFileBytes);
    }
    totalBytes += stat.size;
    if (totalBytes > limits.maxTotalBytes) {
      throw quotaError("aggregate byte", totalBytes, limits.maxTotalBytes);
    }

    await mkdir(dirname(destinationPath), { recursive: true, mode: 0o700 });
    await copyFile(sourcePath, destinationPath);
    await chmod(destinationPath, 0o600);
  }

  const entries = await readdir(inputRoot, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    await copyEntry(
      join(inputRoot, entry.name),
      join(outputRoot, entry.name),
      entry.name,
    );
  }

  return { files, totalBytes };
}

export function normalizeChangedPaths(value) {
  if (!Array.isArray(value)) {
    throw new Error("CodeGraph changed paths must be a JSON array");
  }
  if (value.length > MAX_CHANGED_PATHS) {
    throw new Error(`CodeGraph changed scope may contain at most ${MAX_CHANGED_PATHS} paths`);
  }
  return value.map((rawPath) => {
    if (typeof rawPath !== "string") {
      throw new Error("CodeGraph changed paths must contain only strings");
    }
    const path = rawPath.trim();
    if (path.length > MAX_CHANGED_PATH_CHARS) {
      throw new Error(
        `CodeGraph changed paths may contain at most ${MAX_CHANGED_PATH_CHARS} characters`,
      );
    }
    if (path.includes("\0")) {
      throw new Error("CodeGraph changed paths must not contain NUL characters");
    }
    return path;
  }).filter(Boolean);
}

function boundedDiagnostic(output, maximum = 1000) {
  const compact = output.trim() || "no diagnostic output";
  if (compact.length <= maximum) {
    return compact;
  }
  return `${compact.slice(0, maximum)} [truncated ${compact.length - maximum} characters]`;
}

export function runBoundedCommand(
  executable,
  args,
  {
    cwd,
    env = {},
    timeoutMs = COMMAND_TIMEOUT_MS,
    maxOutputBytes = COMMAND_OUTPUT_LIMIT_BYTES,
  },
) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks = [];
    let outputBytes = 0;
    let outputExceeded = false;
    let timedOut = false;

    function capture(chunk) {
      outputBytes += chunk.length;
      if (outputBytes > maxOutputBytes) {
        outputExceeded = true;
        child.kill("SIGKILL");
        return;
      }
      chunks.push(Buffer.from(chunk));
    }

    child.stdout.on("data", capture);
    child.stderr.on("data", capture);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.once("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`CodeGraph command timed out after ${timeoutMs}ms`));
        return;
      }
      if (outputExceeded) {
        reject(new Error(`CodeGraph command output exceeded ${maxOutputBytes} bytes`));
        return;
      }
      const output = Buffer.concat(chunks).toString("utf8");
      if (code !== 0) {
        reject(new Error(`CodeGraph command exited ${code}: ${boundedDiagnostic(output)}`));
        return;
      }
      resolve(output);
    });
  });
}

export async function runCodeGraphSession(explorePrompt) {
  if (typeof explorePrompt !== "string" || explorePrompt.length === 0) {
    throw new Error("CodeGraph explore prompt is required");
  }
  if (explorePrompt.length > 30_000 || explorePrompt.includes("\0")) {
    throw new Error("CodeGraph explore prompt exceeds the bounded input contract");
  }

  const projectRoot = "/workspace/project";
  const copySummary = await copyInputTree("/input", projectRoot);
  const environment = {
    PATH: "/usr/local/bin:/usr/bin:/bin",
    HOME: "/workspace/home",
    XDG_CACHE_HOME: "/workspace/cache",
    CODEGRAPH_NO_UPDATE_CHECK: "1",
    DO_NOT_TRACK: "1",
    NO_COLOR: "1",
  };
  const nodeExecutable = "/nodejs/bin/node";
  const codegraphShim = "/tooling/node_modules/@colbymchenry/codegraph/npm-shim.js";
  const commands = [
    ["init", "-i"],
    ["sync"],
    ["status"],
    ["explore", explorePrompt],
  ];
  const sections = [
    `Sandbox copied ${copySummary.files} files (${copySummary.totalBytes} bytes).`,
  ];

  for (const args of commands) {
    const output = await runBoundedCommand(nodeExecutable, [codegraphShim, ...args], {
      cwd: projectRoot,
      env: environment,
    });
    sections.push(`## codegraph ${args[0]}\n${output.trim()}`);
  }
  const sessionOutput = sections.join("\n\n");
  if (Buffer.byteLength(sessionOutput, "utf8") > SESSION_OUTPUT_LIMIT_BYTES) {
    throw new Error(
      `CodeGraph sandbox session output exceeded ${SESSION_OUTPUT_LIMIT_BYTES} bytes`,
    );
  }
  return sessionOutput;
}

async function main() {
  try {
    const output = await runCodeGraphSession(process.argv[2] ?? "");
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
