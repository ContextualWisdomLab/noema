import { readFileSync } from "node:fs";

/**
 * Load a short-lived delegated GitHub token from an explicit capability file.
 *
 * The file path is non-secret runtime configuration. The bearer token itself
 * must not be read from the Node process environment. Callers are responsible
 * for creating the file with restrictive permissions in trusted bootstrap code
 * and deleting it after use.
 */
export function readDelegatedGithubToken(tokenPath) {
  const path = String(tokenPath ?? "").trim();
  if (!path) {
    throw new Error("Maintainer token file path is required.");
  }

  let token;
  try {
    token = readFileSync(path, "utf8");
  } catch (error) {
    throw new Error(`Maintainer token file could not be read: ${String(error?.message ?? error)}`);
  }

  if (!token) {
    throw new Error("Maintainer token file must not be empty.");
  }
  if (/[\u0000-\u001f\u007f]/.test(token)) {
    throw new Error("Maintainer token must not contain control characters.");
  }
  return token;
}
