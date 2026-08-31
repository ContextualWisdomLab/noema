/**
 * Canonical `error_code` taxonomy for Noema's layered Cloudflare Worker entrypoints
 * (`index.ts` -> `worker.ts` -> `entrypoint.ts` -> `runtime-entrypoint.ts`). Every layer
 * constructs its own `{ ok: false, error_code, ... }` responses rather than routing them
 * through one shared response builder, so this module is the single place the set of valid
 * codes is declared. Each layer imports `ErrorCode` and annotates every `error_code` literal
 * it writes (`"ERR_..." satisfies ErrorCode`) so the compiler rejects a code introduced in
 * any layer that was never added here — not just the base credential-exchange path.
 */
export type ErrorCode =
  | "ERR_VALIDATION_INPUT"
  | "ERR_AUTH_MISSING"
  | "ERR_AUTH_INVALID"
  | "ERR_AUTH_REPLAY"
  | "ERR_REPO_NOT_ALLOWED"
  | "ERR_WORKFLOW_NOT_ALLOWED"
  | "ERR_TOKEN_MALFORMED"
  | "ERR_OIDC_VERIFICATION"
  | "ERR_GITHUB_API"
  | "ERR_GITHUB_INSTALLATION"
  | "ERR_RATE_LIMIT"
  | "ERR_SERVICE_NOT_READY"
  | "ERR_INTERNAL";

/**
 * Operator-facing remediation hint for every declared `ErrorCode`. Typing this as
 * `Record<ErrorCode, string>` makes an entry mandatory for each code the union declares,
 * so adding a code here without a hint (or vice versa) fails to compile.
 */
export const errorHints: Record<ErrorCode, string> = {
  ERR_VALIDATION_INPUT: "Check the endpoint, HTTP method, content-type, and JSON body.",
  ERR_AUTH_MISSING: "Send a GitHub Actions OIDC token in the Authorization bearer header.",
  ERR_AUTH_INVALID: "Request a fresh OIDC token with the configured issuer, audience, and time window.",
  ERR_AUTH_REPLAY: "Request a fresh GitHub Actions OIDC token; each verified token may be exchanged once.",
  ERR_REPO_NOT_ALLOWED: "Verify target_repository and repository_owner are in the allowed organization.",
  ERR_WORKFLOW_NOT_ALLOWED: "Run the request from the configured central workflow ref.",
  ERR_TOKEN_MALFORMED: "Request a new GitHub Actions OIDC token; the provided token was not parseable or acceptable.",
  ERR_OIDC_VERIFICATION: "Retry after GitHub OIDC JWKS availability is confirmed.",
  ERR_GITHUB_API: "Retry after checking GitHub API availability and the app installation state.",
  ERR_GITHUB_INSTALLATION: "Verify the GitHub App is installed on the target repository.",
  ERR_RATE_LIMIT: "Back off and retry after the rate-limit window resets.",
  ERR_SERVICE_NOT_READY: "Repair the listed configuration checks before routing credential-exchange traffic.",
  ERR_INTERNAL: "Use trace_id to find the matching operational log entry.",
};
