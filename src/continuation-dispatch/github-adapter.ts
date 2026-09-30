import {
  ApiError,
  createGitHubInstallationToken,
  githubApiRequest,
  githubJson,
  type GitHubAppEnv,
  type JwtPayload,
} from "../index";
import {
  dispatchMapping,
  type ContinuationDispatchRequest,
} from "./contract";

const CENTRAL_REPOSITORY = "ContextualWisdomLab/.github";

/** Runtime bindings needed to read a source PR and emit one central continuation. */
export interface ContinuationGitHubAdapterEnv extends GitHubAppEnv {
  CONTINUATION_DISPATCH_GITHUB_APP_ID: string;
  CONTINUATION_DISPATCH_GITHUB_APP_PRIVATE_KEY_PEM: string;
  CONTINUATION_DISPATCH_GITHUB_APP_INSTALLATION_ID: string;
}

/**
 * Stable credential-free adapter failure classes consumed by the public broker
 * handler to distinguish authorization, live-state drift, and upstream outages.
 */
export type ContinuationGitHubFailureClassification =
  | "identity_denied"
  | "live_state_stale"
  | "upstream_unavailable";

/**
 * A credential-free GitHub adapter failure retaining only a stable classification
 * and optional bounded upstream status for handler and persisted-outcome decisions.
 */
export class ContinuationGitHubAdapterError extends Error {
  /** Creates a bounded error without retaining request or credential material. */
  constructor(
    public readonly classification: ContinuationGitHubFailureClassification,
    public readonly upstreamStatus?: number,
  ) {
    super("Continuation GitHub admission failed");
    this.name = "ContinuationGitHubAdapterError";
  }
}

/**
 * Exact live pull-request identity retained after source-state verification,
 * excluding GitHub response metadata that is not part of continuation authority.
 */
export interface VerifiedLivePullRequest {
  readonly repository: string;
  readonly pullRequestNumber: number;
  readonly headSha: string;
  readonly baseSha: string;
  readonly baseRef: string;
}

/**
 * Credential-free terminal result of the one allowed central repository-dispatch
 * attempt, suitable for exactly-once persistence before a receipt is returned.
 */
export type CentralContinuationDispatchResult = {
  readonly outcome: "accepted" | "denied" | "indeterminate";
  readonly upstreamStatus?: number;
  readonly eventType: "noema-review" | "strix-scan";
};

/** Opaque central-only dispatch capability prepared before any indeterminate receipt is committed. */
export interface PreparedCentralContinuationDispatch {
  /** Sends one closed continuation request without exposing the captured installation token. */
  send(request: ContinuationDispatchRequest): Promise<CentralContinuationDispatchResult>;
}

type GithubRepository = { readonly full_name?: unknown };
type GithubPullRequestSide = {
  readonly sha?: unknown;
  readonly ref?: unknown;
  readonly repo?: GithubRepository | null;
};
type GithubPullRequest = {
  readonly state?: unknown;
  readonly draft?: unknown;
  readonly head?: GithubPullRequestSide | null;
  readonly base?: GithubPullRequestSide | null;
};

function sourceReadFailure(error: unknown): ContinuationGitHubAdapterError {
  if (error instanceof ApiError) {
    if (error.upstreamStatus === 403) {
      return new ContinuationGitHubAdapterError("identity_denied", 403);
    }
    if (error.upstreamStatus === 404 || error.upstreamStatus === 422) {
      return new ContinuationGitHubAdapterError("live_state_stale", error.upstreamStatus);
    }
    return new ContinuationGitHubAdapterError("upstream_unavailable", error.upstreamStatus);
  }
  return new ContinuationGitHubAdapterError("upstream_unavailable");
}

function centralCredentialFailure(error: unknown): ContinuationGitHubAdapterError {
  return new ContinuationGitHubAdapterError(
    "upstream_unavailable",
    error instanceof ApiError ? error.upstreamStatus : undefined,
  );
}

function centralAppEnv(env: ContinuationGitHubAdapterEnv): GitHubAppEnv {
  return {
    ...env,
    GITHUB_APP_ID: env.CONTINUATION_DISPATCH_GITHUB_APP_ID,
    GITHUB_APP_PRIVATE_KEY_PEM: env.CONTINUATION_DISPATCH_GITHUB_APP_PRIVATE_KEY_PEM,
    GITHUB_APP_INSTALLATION_ID: env.CONTINUATION_DISPATCH_GITHUB_APP_INSTALLATION_ID,
  };
}

/**
 * Serializes the exact fixed repository-dispatch body used for both transport and receipt hashing.
 * @param request Closed continuation request whose action maps to one released central event.
 * @returns Canonical adapter-owned JSON bytes shared by digest calculation and GitHub transport.
 */
export function centralDispatchBody(request: ContinuationDispatchRequest): string {
  return JSON.stringify({
    event_type: dispatchMapping(request.dispatch_action).eventType,
    client_payload: {
      source_repository: request.source_repository,
      pull_request_number: request.pull_request_number,
      expected_head_sha: request.expected_head_sha,
      expected_base_sha: request.expected_base_sha,
      expected_base_ref: request.expected_base_ref,
      transport_retry_attempt: request.transport_retry_attempt,
    },
  });
}

/**
 * Reads the source PR through a read-only installation token and admits only the
 * exact open, non-draft, non-fork state bound into the verified request.
 * @param claims Cryptographically verified GitHub Actions OIDC claims.
 * @param request Closed and canonical continuation dispatch request.
 * @param env Separate source-read and central-dispatch GitHub App bindings.
 * @returns The exact credential-free live PR identity admitted for dispatch.
 * @throws {ContinuationGitHubAdapterError} When identity, live state, or GitHub access fails closed.
 */
export async function readAndVerifyLivePullRequest(
  claims: JwtPayload,
  request: ContinuationDispatchRequest,
  env: ContinuationGitHubAdapterEnv,
): Promise<VerifiedLivePullRequest> {
  if (claims.repository !== request.source_repository) {
    throw new ContinuationGitHubAdapterError("identity_denied");
  }

  let installationToken: string;
  try {
    const installation = await createGitHubInstallationToken(
      request.source_repository,
      env,
      { pull_requests: "read" },
    );
    installationToken = installation.token;
  } catch (error) {
    throw centralCredentialFailure(error);
  }

  let pullRequest: GithubPullRequest;
  try {
    pullRequest = await githubJson(
      `/repos/${request.source_repository}/pulls/${request.pull_request_number}`,
      {
        method: "GET",
        headers: { authorization: `Bearer ${installationToken}` },
      },
      env,
      200,
    ) as GithubPullRequest;
  } catch (error) {
    throw sourceReadFailure(error);
  }

  if (
    pullRequest.state !== "open"
    || pullRequest.draft !== false
    || pullRequest.head?.repo?.full_name !== request.source_repository
    || pullRequest.base?.repo?.full_name !== request.source_repository
    || pullRequest.head.sha !== request.expected_head_sha
    || pullRequest.base.sha !== request.expected_base_sha
    || pullRequest.base.ref !== request.expected_base_ref
  ) {
    throw new ContinuationGitHubAdapterError("live_state_stale");
  }

  return Object.freeze({
    repository: request.source_repository,
    pullRequestNumber: request.pull_request_number,
    headSha: request.expected_head_sha,
    baseSha: request.expected_base_sha,
    baseRef: request.expected_base_ref,
  });
}

/**
 * Mints a distinct central-only installation token and uses it solely for the
 * fixed `.github` repository-dispatch endpoint and closed event payload.
 * @param env Separate source-read and central-dispatch GitHub App bindings.
 * @returns An opaque prepared sender that retains the short-lived token without exposing it.
 * @throws {ContinuationGitHubAdapterError} When central credential minting fails before dispatch.
 */
export async function prepareCentralContinuation(
  env: ContinuationGitHubAdapterEnv,
): Promise<PreparedCentralContinuationDispatch> {
  let installationToken: string;
  try {
    const installation = await createGitHubInstallationToken(
      CENTRAL_REPOSITORY,
      centralAppEnv(env),
      { contents: "write" },
    );
    installationToken = installation.token;
  } catch (error) {
    throw centralCredentialFailure(error);
  }

  return Object.freeze({
    async send(request: ContinuationDispatchRequest): Promise<CentralContinuationDispatchResult> {
      const eventType = dispatchMapping(request.dispatch_action).eventType;
      let response: Response;
      try {
        response = await githubApiRequest(
          "/repos/ContextualWisdomLab/.github/dispatches",
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${installationToken}`,
              "content-type": "application/json",
            },
            body: centralDispatchBody(request),
          },
          env,
        );
      } catch {
        return Object.freeze({ outcome: "indeterminate", eventType });
      }

      if (response.status === 204) {
        return Object.freeze({ outcome: "accepted", upstreamStatus: 204, eventType });
      }
      if (response.status === 403 || response.status === 404 || response.status === 422) {
        return Object.freeze({ outcome: "denied", upstreamStatus: response.status, eventType });
      }
      return Object.freeze({ outcome: "indeterminate", upstreamStatus: response.status, eventType });
    },
  });
}

/**
 * Prepares the central credential and immediately sends one fixed dispatch for direct adapter callers.
 * @param request Closed continuation request whose action maps to one released central event.
 * @param env Separate source-read and central-dispatch GitHub App bindings.
 * @returns A terminal accepted, denied, or indeterminate dispatch result without credentials.
 * @throws {ContinuationGitHubAdapterError} When central credential preparation fails before dispatch.
 */
export async function dispatchCentralContinuation(
  request: ContinuationDispatchRequest,
  env: ContinuationGitHubAdapterEnv,
): Promise<CentralContinuationDispatchResult> {
  return (await prepareCentralContinuation(env)).send(request);
}
