import { isTrustedGithubApiBase } from "./entrypoint";

const trustedAudiencePattern = /^[A-Za-z0-9._:-]{1,128}$/;
const trustedOwnerPattern = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const positiveDecimalPattern = /^[1-9][0-9]*$/;
const privateKeyPattern = /^-----BEGIN PRIVATE KEY-----\r?\n([A-Za-z0-9+/=\r\n]+)\r?\n-----END PRIVATE KEY-----$/;
const exactCommitPattern = /^[0-9a-fA-F]{40}$/;
const trustedNamedRefPattern = /^refs\/(?:heads|tags)\/(?=.{1,1024}$)(?!\.)(?![^/]*\.lock(?:\/|$))(?!.*\/\.)(?!.*\/[^/]*\.lock(?:\/|$))(?!.*(?:\.\.|\/\/|@\{|\\|[\x00-\x20\x7f~^:?*\[]))(?!.*[\/.]$)[A-Za-z0-9._/-]+$/;

/**
 * Stable identifiers for configuration checks that can make the runtime
 * unavailable for credential-exchange traffic.
 *
 * These identifiers are safe to return to operators because they name only
 * the failed boundary. They never contain the configured value or secret.
 */
export type RuntimeReadinessFailure =
  | "allowed_issuer"
  | "allowed_audience"
  | "allowed_repository_owner"
  | "allowed_workflow_repository"
  | "allowed_workflow_ref"
  | "github_api_base"
  | "github_app_id"
  | "github_app_private_key"
  | "github_app_installation_id";

/**
 * Environment values required to decide whether Noema can safely accept
 * credential-exchange traffic.
 *
 * Every property is optional at the type boundary because a missing binding
 * must produce a deterministic not-ready result instead of throwing during
 * worker startup.
 */
export interface RuntimeReadinessEnv {
  ALLOWED_ISSUER?: string;
  ALLOWED_AUDIENCE?: string;
  ALLOWED_REPOSITORY_OWNER?: string;
  ALLOWED_WORKFLOW_REPOSITORY?: string;
  ALLOWED_WORKFLOW_REF_PREFIX?: string;
  GITHUB_API_BASE?: string;
  GITHUB_APP_ID?: string;
  GITHUB_APP_PRIVATE_KEY_PEM?: string;
  GITHUB_APP_INSTALLATION_ID?: string;
}

/**
 * Offline readiness decision returned to the HTTP adapter.
 *
 * `ready` is true only when every required check passes. `failedChecks` keeps
 * deterministic evaluation order so operators can compare evidence without
 * seeing configuration values.
 */
export interface RuntimeReadinessResult {
  ready: boolean;
  failedChecks: RuntimeReadinessFailure[];
}

interface PrivateKeyReadinessCacheEntry {
  privateKeyPem: string | undefined;
  importability: Promise<boolean>;
}

const privateKeyReadinessCache = new WeakMap<
  RuntimeReadinessEnv,
  PrivateKeyReadinessCacheEntry
>();

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isTrustedWorkflowRepository(value: string, owner: string): boolean {
  const escapedOwner = escapeRegularExpression(owner);
  return new RegExp(`^${escapedOwner}/[A-Za-z0-9_.-]{1,100}$`).test(value);
}

function isExactWorkflowRef(value: string, repository: string): boolean {
  const escapedRepository = escapeRegularExpression(repository);
  const workflowRefPattern = new RegExp(
    `^${escapedRepository}/\\.github/workflows/[A-Za-z0-9_.-]{1,100}\\.ya?ml@(.+)$`,
  );
  const match = workflowRefPattern.exec(value);
  if (!match) return false;

  const refName = match[1];
  return exactCommitPattern.test(refName) || trustedNamedRefPattern.test(refName);
}

async function isImportablePrivateKey(value: string | undefined): Promise<boolean> {
  try {
    const match = privateKeyPattern.exec(value ?? "");
    if (!match) throw new TypeError("PKCS#8 PEM envelope missing");
    const compact = match[1].replace(/\s+/g, "");
    const binary = atob(compact);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    await crypto.subtle.importKey(
      "pkcs8",
      bytes,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
    return true;
  } catch {
    return false;
  }
}

/** Reuse only an unchanged private-key import while other bindings stay live. */
function cachedPrivateKeyImportability(env: RuntimeReadinessEnv): Promise<boolean> {
  const privateKeyPem = env.GITHUB_APP_PRIVATE_KEY_PEM;
  const cached = privateKeyReadinessCache.get(env);
  if (cached && cached.privateKeyPem === privateKeyPem) return cached.importability;

  const importability = isImportablePrivateKey(privateKeyPem);
  privateKeyReadinessCache.set(env, { privateKeyPem, importability });
  return importability;
}

/**
 * Evaluate the offline configuration required for credential-exchange traffic.
 *
 * The evaluator performs no network calls and does not mint a token. It checks
 * trust-boundary syntax, GitHub Cloud origin binding, positive App identifiers,
 * and whether WebCrypto can import the configured PKCS#8 private key. Repeated
 * probes that receive the same environment object and unchanged key reuse the
 * in-flight or completed import decision; a changed key is imported again.
 *
 * @param env - Worker bindings used by the credential-exchange implementation.
 * @returns A deterministic readiness decision with safe failed-check names.
 */
export async function evaluateRuntimeReadiness(
  env: RuntimeReadinessEnv,
): Promise<RuntimeReadinessResult> {
  const failedChecks: RuntimeReadinessFailure[] = [];
  const owner = env.ALLOWED_REPOSITORY_OWNER ?? "";
  const workflowRepository = env.ALLOWED_WORKFLOW_REPOSITORY ?? "";
  const workflowRef = env.ALLOWED_WORKFLOW_REF_PREFIX ?? "";

  if (env.ALLOWED_ISSUER !== "https://token.actions.githubusercontent.com") {
    failedChecks.push("allowed_issuer");
  }
  if (!trustedAudiencePattern.test(env.ALLOWED_AUDIENCE ?? "")) {
    failedChecks.push("allowed_audience");
  }
  if (!trustedOwnerPattern.test(owner)) {
    failedChecks.push("allowed_repository_owner");
  }
  if (!isTrustedWorkflowRepository(workflowRepository, owner)) {
    failedChecks.push("allowed_workflow_repository");
  }
  if (!isExactWorkflowRef(workflowRef, workflowRepository)) {
    failedChecks.push("allowed_workflow_ref");
  }
  if (!isTrustedGithubApiBase(env.GITHUB_API_BASE)) {
    failedChecks.push("github_api_base");
  }
  if (!positiveDecimalPattern.test(env.GITHUB_APP_ID ?? "")) {
    failedChecks.push("github_app_id");
  }
  if (!await cachedPrivateKeyImportability(env)) {
    failedChecks.push("github_app_private_key");
  }
  if (
    env.GITHUB_APP_INSTALLATION_ID !== undefined
    && !positiveDecimalPattern.test(env.GITHUB_APP_INSTALLATION_ID)
  ) {
    failedChecks.push("github_app_installation_id");
  }

  return {
    ready: failedChecks.length === 0,
    failedChecks,
  };
}
