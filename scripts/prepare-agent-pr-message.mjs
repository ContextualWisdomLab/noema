#!/usr/bin/env node
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const controlCharacterPattern = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u0080-\u009f\u202a-\u202e\u2066-\u2069]/u;
const markdownHeadingPattern = /^#{1,6}[\t ]*/u;
const positiveIntegerPattern = /^[1-9][0-9]*$/u;

/**
 * Synchronous filesystem operations used by the trusted metadata adapter.
 *
 * The object is injectable so tests can deterministically exercise descriptor
 * replacement, short-read, and cleanup failures without racing the host
 * filesystem. Production always passes this frozen implementation.
 */
export const defaultAgentPrMessageFileSystem = Object.freeze({
  closeSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  writeFileSync,
});

/**
 * Return the number of UTF-8 wire bytes required for a text value.
 *
 * @param {string} value Text whose encoded size is required.
 * @returns {number} Exact UTF-8 byte length.
 */
export function utf8Length(value) {
  return Buffer.byteLength(value, "utf8");
}

/**
 * Normalize CRLF and legacy CR line endings without changing other content.
 *
 * @param {string} value Decoded metadata text.
 * @returns {string} Text using LF line endings only.
 */
export function normalizeLineEndings(value) {
  return value.replace(/\r\n?/gu, "\n");
}

/**
 * Parse one required positive decimal byte limit from the environment.
 *
 * @param {string | undefined} raw Untrusted environment-variable value.
 * @param {string} name Variable name used in the bounded diagnostic.
 * @returns {number} Validated positive integer limit.
 * @throws {Error} When the value is absent, zero, negative, or non-decimal.
 */
export function parsePositiveLimit(raw, name) {
  if (!positiveIntegerPattern.test(raw ?? "")) {
    throw new Error(`${name} must be a positive decimal integer`);
  }
  return Number(raw);
}

/**
 * Parse bounded, model-generated pull-request metadata without replacement decoding.
 *
 * @param {Uint8Array} bytes Raw PR_MESSAGE.md bytes.
 * @param {{maxTitleBytes: number, maxBodyBytes: number}} limits UTF-8 byte budgets.
 * @returns {{title: string, body: string}} Normalized title and Markdown body.
 * @throws {Error} When metadata is malformed, unsafe, empty, or over budget.
 */
export function parseAgentPrMessage(bytes, limits) {
  let decoded;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("PR_MESSAGE.md must be valid UTF-8");
  }

  const normalized = normalizeLineEndings(decoded);
  if (controlCharacterPattern.test(normalized)) {
    throw new Error("PR metadata contains unsupported control characters");
  }

  const [rawTitle, ...bodyLines] = normalized.split("\n");
  const title = rawTitle.replace(markdownHeadingPattern, "").trim();
  const body = bodyLines.join("\n").trim();

  if (!title || utf8Length(title) > limits.maxTitleBytes) {
    throw new Error("PR title is empty or exceeds the byte budget");
  }
  if (utf8Length(body) > limits.maxBodyBytes) {
    throw new Error("PR body exceeds the byte budget");
  }
  return { title, body };
}

/**
 * Read a bounded regular file while rejecting symlinks and replacement races.
 *
 * @param {string} path Source metadata path.
 * @param {number} maximumBytes Maximum accepted file size.
 * @param {{lstatSync: Function, openSync: Function, fstatSync: Function, readFileSync: Function, closeSync: Function}} fileSystem Injectable synchronous filesystem operations.
 * @returns {Buffer | Uint8Array} Exact bytes read from the validated descriptor.
 * @throws {Error} When the path is not a stable bounded regular file.
 */
export function readRegularFileWithoutFollowingSymlinks(
  path,
  maximumBytes,
  fileSystem,
) {
  const linkMetadata = fileSystem.lstatSync(path);
  if (!linkMetadata.isFile()) {
    throw new Error("PR_MESSAGE.md must be a regular non-symlink file");
  }
  if (linkMetadata.isSymbolicLink()) {
    throw new Error("PR_MESSAGE.md must be a regular non-symlink file");
  }
  if (linkMetadata.size > maximumBytes) {
    throw new Error("PR_MESSAGE.md exceeds the combined byte budget");
  }

  let descriptor;
  try {
    descriptor = fileSystem.openSync(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    const openedMetadata = fileSystem.fstatSync(descriptor);
    if (!openedMetadata.isFile()) {
      throw new Error("PR_MESSAGE.md changed during validation");
    }
    if (openedMetadata.dev !== linkMetadata.dev) {
      throw new Error("PR_MESSAGE.md changed during validation");
    }
    if (openedMetadata.ino !== linkMetadata.ino) {
      throw new Error("PR_MESSAGE.md changed during validation");
    }
    const bytes = fileSystem.readFileSync(descriptor);
    if (bytes.byteLength > maximumBytes) {
      throw new Error("PR_MESSAGE.md exceeds the combined byte budget");
    }
    return bytes;
  } finally {
    if (descriptor !== undefined) fileSystem.closeSync(descriptor);
  }
}

/**
 * Create one owner-only output file without replacing an existing path.
 *
 * @param {string} path Trusted output path.
 * @param {string} value Validated UTF-8 text to write.
 * @param {{writeFileSync: Function}} fileSystem Injectable synchronous filesystem operation.
 * @returns {void}
 * @throws {Error} When the path already exists or cannot be written safely.
 */
export function writePrivateFile(path, value, fileSystem) {
  fileSystem.writeFileSync(path, value, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
}

/**
 * Run the strict command-line adapter used by the trusted publisher job.
 *
 * @param {string[]} argv Three paths: source, title output, and body output.
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} environment Byte-budget environment values.
 * @param {typeof defaultAgentPrMessageFileSystem} fileSystem Injectable filesystem operations.
 * @returns {void}
 * @throws {Error} When arguments, limits, source metadata, or outputs are invalid.
 */
export function runAgentPrMessageCli(argv, environment, fileSystem) {
  if (argv.length !== 3) {
    throw new Error(
      "Usage: prepare-agent-pr-message.mjs PR_MESSAGE.md pr-title.txt pr-body.md",
    );
  }
  const [sourcePath, titlePath, bodyPath] = argv;
  const maxTitleBytes = parsePositiveLimit(
    environment.MAX_PR_TITLE_BYTES,
    "MAX_PR_TITLE_BYTES",
  );
  const maxBodyBytes = parsePositiveLimit(
    environment.MAX_PR_BODY_BYTES,
    "MAX_PR_BODY_BYTES",
  );
  const bytes = readRegularFileWithoutFollowingSymlinks(
    sourcePath,
    maxTitleBytes + maxBodyBytes + 16_384,
    fileSystem,
  );
  const parsed = parseAgentPrMessage(bytes, { maxTitleBytes, maxBodyBytes });
  writePrivateFile(titlePath, parsed.title, fileSystem);
  writePrivateFile(bodyPath, parsed.body, fileSystem);
}

/**
 * Execute the production CLI using Node process arguments and environment.
 *
 * @returns {void}
 */
export function executeDefaultAgentPrMessageCli() {
  runAgentPrMessageCli(
    process.argv.slice(2),
    process.env,
    defaultAgentPrMessageFileSystem,
  );
}

/**
 * Write one bounded CLI diagnostic to standard error.
 *
 * @param {string} message Diagnostic including its trailing newline.
 * @returns {void}
 */
export function writeAgentPrMessageCliError(message) {
  process.stderr.write(message);
}

/**
 * Set the process exit code without terminating synchronous cleanup.
 *
 * @param {number} code Non-zero failure code.
 * @returns {void}
 */
export function setAgentPrMessageCliExitCode(code) {
  process.exitCode = code;
}

/**
 * Execute the CLI only for a direct module invocation and bound any diagnostic.
 *
 * @param {boolean} invoked Whether the current module is the direct Node entrypoint.
 * @param {() => void} cli Trusted CLI operation.
 * @param {(message: string) => void} writeError Diagnostic sink.
 * @param {(code: number) => void} setExitCode Exit-code sink.
 * @returns {void}
 */
export function runAgentPrMessageEntrypoint(
  invoked,
  cli,
  writeError,
  setExitCode,
) {
  if (!invoked) return;
  try {
    cli();
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "PR metadata parsing failed";
    writeError(`${message}\n`);
    setExitCode(1);
  }
}

const invokedPath = pathToFileURL(resolve(process.argv[1])).href;
runAgentPrMessageEntrypoint(
  invokedPath === import.meta.url,
  executeDefaultAgentPrMessageCli,
  writeAgentPrMessageCliError,
  setAgentPrMessageCliExitCode,
);
