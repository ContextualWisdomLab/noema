#!/usr/bin/env node
import { constants } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readdir,
  writeFile,
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
export const BUNDLED_CODEGRAPH_NODE =
  "/tooling/node_modules/@colbymchenry/codegraph-linux-x64/node";
export const BUNDLED_CODEGRAPH_ENTRYPOINT =
  "/tooling/node_modules/@colbymchenry/codegraph-linux-x64/lib/dist/bin/codegraph.js";

function quotaError(name, observed, maximum) {
  return new Error(`CodeGraph sandbox ${name} quota exceeded: ${observed} > ${maximum}`);
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

async function openValidatedRegularFile(sourcePath, pathStat) {
  if (typeof constants.O_NOFOLLOW !== "number") {
    throw new Error("CodeGraph sandbox requires O_NOFOLLOW for input file isolation");
  }

  let handle;
  try {
    handle = await open(sourcePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ELOOP") {
      throw new Error(`CodeGraph sandbox refuses symbolic link: ${sourcePath}`);
    }
    throw error;
  }

  try {
    const openedStat = await handle.stat();
    if (!openedStat.isFile()) {
      throw new Error(`CodeGraph sandbox refuses non-regular input: ${sourcePath}`);
    }
    if (!sameFileIdentity(pathStat, openedStat)) {
      throw new Error(`CodeGraph sandbox input changed before open: ${sourcePath}`);
    }
    return { handle, openedStat };
  } catch (error) {
    await handle.close();
    throw error;
  }
}

async function readStableFileSnapshot(handle, sourcePath, openedStat) {
  const bytes = Buffer.alloc(openedStat.size);
  let offset = 0;
  while (offset < bytes.length) {
    const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
    if (bytesRead === 0) {
      throw new Error(`CodeGraph sandbox input changed during read: ${sourcePath}`);
    }
    offset += bytesRead;
  }

  const probe = Buffer.allocUnsafe(1);
  const { bytesRead: extraBytes } = await handle.read(probe, 0, 1, openedStat.size);
  if (extraBytes !== 0) {
    throw new Error(`CodeGraph sandbox input grew during read: ${sourcePath}`);
  }

  const afterReadStat = await handle.stat();
  if (
    afterReadStat.size !== openedStat.size
    || afterReadStat.mtimeMs !== openedStat.mtimeMs
    || afterReadStat.ctimeMs !== openedStat.ctimeMs
  ) {
    throw new Error(`CodeGraph sandbox input changed during read: ${sourcePath}`);
  }

  const currentPathStat = await lstat(sourcePath);
  if (!currentPathStat.isFile() || !sameFileIdentity(currentPathStat, openedStat)) {
    throw new Error(`CodeGraph sandbox input path changed during copy: ${sourcePath}`);
  }

  return bytes;
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

    const { handle, openedStat } = await openValidatedRegularFile(sourcePath, stat);
    try {
      files += 1;
      if (files > limits.maxFiles) {
        throw quotaError("file-count", files, limits.maxFiles);
      }
      if (openedStat.size > limits.maxFileBytes) {
        throw quotaError("per-file byte", openedStat.size, limits.maxFileBytes);
      }
      totalBytes += openedStat.size;
      if (totalBytes > limits.maxTotalBytes) {
        throw quotaError("aggregate byte", totalBytes, limits.maxTotalBytes);
      }

      const bytes = await readStableFileSnapshot(handle, sourcePath, openedStat);
      await mkdir(dirname(destinationPath), { recursive: true, mode: 0o700 });
      await writeFile(destinationPath, bytes, { mode: 0o600, flag: "w" });
      await chmod(destinationPath, 0o600);
    } finally {
      await handle.close();
    }
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
    CODEGRAPH_HOST_PPID: String(process.ppid),
    DO_NOT_TRACK: "1",
    NO_COLOR: "1",
  };
  const runtimeFlags = [
    "--liftoff-only",
    "--disable-warning=ExperimentalWarning",
    BUNDLED_CODEGRAPH_ENTRYPOINT,
  ];
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
    const output = await runBoundedCommand(
      BUNDLED_CODEGRAPH_NODE,
      [...runtimeFlags, ...args],
      {
        cwd: projectRoot,
        env: environment,
      },
    );
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
