import { isTrustedGithubApiBase } from "./entrypoint";

const trustedAudiencePattern = /^[A-Za-z0-9._:-]{1,128}$/;
const trustedOwnerPattern = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const expectedRepositoryOwner = "ContextualWisdomLab";
const expectedWorkflowRepository = "ContextualWisdomLab/.github";
const positiveDecimalPattern = /^[1-9][0-9]*$/;
const privateKeyPattern = /^-----BEGIN PRIVATE KEY-----\r?\n([A-Za-z0-9+/=\r\n]+)\r?\n-----END PRIVATE KEY-----$/;
const exactCommitPattern = /^[0-9a-f]{40}$/;
const exactWorkflowShaPattern = /^[0-9a-f]{40}$/;
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
  | "allowed_workflow_sha"
  | "github_api_base"
  | "github_app_id"
  | "github_app_private_key"
  | "github_app_installation_id"
  | "noema_rate_limiter"
  | "noema_oidc_replay_guard";

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
  ALLOWED_WORKFLOW_SHA?: string;
  GITHUB_API_BASE?: string;
  GITHUB_APP_ID?: string;
  GITHUB_APP_PRIVATE_KEY_PEM?: string;
  GITHUB_APP_INSTALLATION_ID?: string;
  NOEMA_RATE_LIMITER?: DurableObjectNamespace;
  NOEMA_OIDC_REPLAY_GUARD?: DurableObjectNamespace;
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

/**
 * Admit only the canonical organization-owned reusable-workflow repository.
 *
 * Owner consistency and exact repository pinning prevent a syntactically valid
 * sibling repository from becoming credential-exchange workflow authority.
 *
 * @param value configured reusable-workflow repository
 * @param owner configured repository owner
 * @returns true only for the canonical `.github` repository binding
 */
function isTrustedWorkflowRepository(value: string, owner: string): boolean {
  if (value !== expectedWorkflowRepository) return false;
  const prefix = `${owner}/`;
  if (!value.startsWith(prefix)) return false;
  const repositoryName = value.slice(prefix.length);
  return repositoryName !== "."
    && repositoryName !== ".."
    && /^[A-Za-z0-9_.-]{1,100}$/.test(repositoryName);
}

/**
 * Extract the exact workflow source ref from the configured reusable-workflow
 * identity without dynamically constructing a regular expression.
 *
 * The workflow filename remains compatible with GitHub's one-to-100-character
 * name grammar and must end in `.yml` or `.yaml`. The returned ref is validated
 * separately as either an immutable commit or a trusted named ref.
 *
 * @param value full `owner/repo/.github/workflows/file@ref` identity
 * @param repository exact trusted workflow repository
 * @returns the ref suffix when the workflow identity grammar is valid
 */
function workflowRefName(value: string, repository: string): string | undefined {
  const separator = value.indexOf("@");
  if (
    separator <= 0
    || separator !== value.lastIndexOf("@")
    || separator === value.length - 1
  ) {
    return undefined;
  }
  const prefix = `${repository}/.github/workflows/`;
  if (!value.startsWith(prefix)) return undefined;
  const workflowAndRef = value.slice(prefix.length);
  const at = workflowAndRef.lastIndexOf("@");
  if (at <= 0) return undefined;
  const workflow = workflowAndRef.slice(0, at);
  if (workflow.length > 105 || (!workflow.endsWith(".yml") && !workflow.endsWith(".yaml"))) {
    return undefined;
  }
  const workflowName = workflow.endsWith(".yaml")
    ? workflow.slice(0, -5)
    : workflow.slice(0, -4);
  if (!workflowName || workflowName.length > 100 || [...workflowName].some((character) => !/[A-Za-z0-9_.-]/.test(character))) {
    return undefined;
  }
  return workflowAndRef.slice(at + 1);
}

/**
 * Validate a structurally admitted workflow identity against supported ref authority.
 *
 * Only an immutable commit or a Git-compatible trusted named ref may proceed;
 * arbitrary suffix text cannot satisfy runtime readiness.
 *
 * @param value full reusable-workflow identity
 * @param repository exact trusted workflow repository
 * @returns true when the extracted ref is supported
 */
function isExactWorkflowRef(value: string, repository: string): boolean {
  const refName = workflowRefName(value, repository);
  if (!refName) return false;
  return exactCommitPattern.test(refName) || trustedNamedRefPattern.test(refName);
}

/**
 * Extract immutable workflow commit authority without promoting named refs.
 *
 * @param value full reusable-workflow identity
 * @param repository exact trusted workflow repository
 * @returns canonical lowercase commit SHA when the ref is immutable
 */
function immutableWorkflowCommit(value: string, repository: string): string | undefined {
  const refName = workflowRefName(value, repository);
  return refName && exactCommitPattern.test(refName) ? refName : undefined;
}

/**
 * Admit positive identifiers only when their decimal text is canonical and safe.
 *
 * This rejects coercion, leading-zero aliases, and integers outside JavaScript's
 * exact range before they can become App installation or application identity.
 *
 * @param value candidate decimal identifier
 * @returns true only for canonical positive safe-integer text
 */
function isCanonicalPositiveSafeInteger(value: string | undefined): boolean {
  if (!positiveDecimalPattern.test(value ?? "")) return false;
  const numericValue = Number(value);
  return Number.isSafeInteger(numericValue) && String(numericValue) === value;
}

/**
 * Admit only the Durable Object capability shape used by Noema runtime state.
 *
 * Structural capability admission does not transfer the Durable Object's domain
 * truth into Runtime Readiness; it only proves the required namespace methods exist.
 *
 * @param value candidate binding
 * @returns true when the runtime can address and obtain a Durable Object stub
 */
function isDurableObjectNamespace(value: unknown): value is DurableObjectNamespace {
  if (!value || (typeof value !== "object" && typeof value !== "function")) {
    return false;
  }
  const candidate = value as Partial<DurableObjectNamespace>;
  return typeof candidate.idFromName === "function" && typeof candidate.get === "function";
}

/**
 * Prove that the configured PKCS#8 private key is syntactically and cryptographically importable.
 *
 * The check performs no signing and no network call; it is a local readiness
 * boundary that avoids exposing key bytes in failure diagnostics.
 *
 * @param value configured PKCS#8 PEM
 * @returns true when WebCrypto accepts the key for the required signing algorithm
 */
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
 * trust-boundary syntax, exact reusable-workflow source identity and immutable-ref
 * coherence, GitHub Cloud origin binding, positive App identifiers, whether WebCrypto
 * can import the configured PKCS#8 private key, and whether both distributed state
 * bindings expose the namespace operations used by the rate limiter and single-use
 * OIDC replay guard. Repeated probes that receive the same environment object and
 * unchanged key reuse the in-flight or completed import decision; a changed key is
 * imported again.
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
  const configuredWorkflowSha = env.ALLOWED_WORKFLOW_SHA ?? "";
  const immutableRefCommit = immutableWorkflowCommit(workflowRef, workflowRepository);

  if (env.ALLOWED_ISSUER !== "https://token.actions.githubusercontent.com") {
    failedChecks.push("allowed_issuer");
  }
  if (!trustedAudiencePattern.test(env.ALLOWED_AUDIENCE ?? "")) {
    failedChecks.push("allowed_audience");
  }
  if (owner !== expectedRepositoryOwner || !trustedOwnerPattern.test(owner)) {
    failedChecks.push("allowed_repository_owner");
  }
  if (!isTrustedWorkflowRepository(workflowRepository, owner)) {
    failedChecks.push("allowed_workflow_repository");
  }
  if (!isExactWorkflowRef(workflowRef, workflowRepository)) {
    failedChecks.push("allowed_workflow_ref");
  }
  if (
    !exactWorkflowShaPattern.test(configuredWorkflowSha)
    || (immutableRefCommit !== undefined && immutableRefCommit !== configuredWorkflowSha)
  ) {
    failedChecks.push("allowed_workflow_sha");
  }
  if (!isTrustedGithubApiBase(env.GITHUB_API_BASE)) {
    failedChecks.push("github_api_base");
  }
  if (!isCanonicalPositiveSafeInteger(env.GITHUB_APP_ID)) {
    failedChecks.push("github_app_id");
  }
  if (!await cachedPrivateKeyImportability(env)) {
    failedChecks.push("github_app_private_key");
  }
  if (
    env.GITHUB_APP_INSTALLATION_ID !== undefined
    && !isCanonicalPositiveSafeInteger(env.GITHUB_APP_INSTALLATION_ID)
  ) {
    failedChecks.push("github_app_installation_id");
  }
  if (!isDurableObjectNamespace(env.NOEMA_RATE_LIMITER)) {
    failedChecks.push("noema_rate_limiter");
  }
  if (!isDurableObjectNamespace(env.NOEMA_OIDC_REPLAY_GUARD)) {
    failedChecks.push("noema_oidc_replay_guard");
  }

  return {
    ready: failedChecks.length === 0,
    failedChecks,
  };
}
