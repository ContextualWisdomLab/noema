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
 * Return the number of UTF-8 wire bytes required for a text value.
 *
 * @param {string} value Text whose encoded size is required.
 * @returns {number} Exact UTF-8 byte length.
 */
function utf8Length(value) {
  return Buffer.byteLength(value, "utf8");
}

/**
 * Normalize CRLF and legacy CR line endings without changing other content.
 *
 * @param {string} value Decoded metadata text.
 * @returns {string} Text using LF line endings only.
 */
function normalizeLineEndings(value) {
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
function parsePositiveLimit(raw, name) {
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

  const [rawTitle = "", ...bodyLines] = normalized.split("\n");
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
 * @returns {Buffer} Exact bytes read from the validated descriptor.
 * @throws {Error} When the path is not a stable bounded regular file.
 */
function readRegularFileWithoutFollowingSymlinks(path, maximumBytes) {
  const linkMetadata = lstatSync(path);
  if (!linkMetadata.isFile() || linkMetadata.isSymbolicLink()) {
    throw new Error("PR_MESSAGE.md must be a regular non-symlink file");
  }
  if (linkMetadata.size > maximumBytes) {
    throw new Error("PR_MESSAGE.md exceeds the combined byte budget");
  }

  let descriptor;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const openedMetadata = fstatSync(descriptor);
    if (
      !openedMetadata.isFile()
      || openedMetadata.dev !== linkMetadata.dev
      || openedMetadata.ino !== linkMetadata.ino
    ) {
      throw new Error("PR_MESSAGE.md changed during validation");
    }
    const bytes = readFileSync(descriptor);
    if (bytes.byteLength > maximumBytes) {
      throw new Error("PR_MESSAGE.md exceeds the combined byte budget");
    }
    return bytes;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

/**
 * Create one owner-only output file without replacing an existing path.
 *
 * @param {string} path Trusted output path.
 * @param {string} value Validated UTF-8 text to write.
 * @returns {void}
 * @throws {Error} When the path already exists or cannot be written safely.
 */
function writePrivateFile(path, value) {
  writeFileSync(path, value, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
}

/**
 * Run the strict command-line adapter used by the trusted publisher job.
 *
 * @returns {void}
 * @throws {Error} When arguments, limits, source metadata, or outputs are invalid.
 */
function runCli() {
  const [sourcePath, titlePath, bodyPath] = process.argv.slice(2);
  if (!sourcePath || !titlePath || !bodyPath) {
    throw new Error(
      "Usage: prepare-agent-pr-message.mjs PR_MESSAGE.md pr-title.txt pr-body.md",
    );
  }

  const maxTitleBytes = parsePositiveLimit(
    process.env.MAX_PR_TITLE_BYTES,
    "MAX_PR_TITLE_BYTES",
  );
  const maxBodyBytes = parsePositiveLimit(
    process.env.MAX_PR_BODY_BYTES,
    "MAX_PR_BODY_BYTES",
  );
  const bytes = readRegularFileWithoutFollowingSymlinks(
    sourcePath,
    maxTitleBytes + maxBodyBytes + 16_384,
  );
  const parsed = parseAgentPrMessage(bytes, { maxTitleBytes, maxBodyBytes });
  writePrivateFile(titlePath, parsed.title);
  writePrivateFile(bodyPath, parsed.body);
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";
if (invokedPath === import.meta.url) {
  try {
    runCli();
  } catch (error) {
    const message = error instanceof Error ? error.message : "PR metadata parsing failed";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
