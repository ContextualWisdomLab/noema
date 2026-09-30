import { parseExactBearerToken } from "../bearer-authorization";
import type { JwtPayload } from "../index";
import { errorHints, type ErrorCode } from "../error-codes";
import {
  continuationDispatchIdentity,
  continuationRequestDigest,
  dispatchMapping,
  parseContinuationDispatchRequest,
  type ContinuationDispatchRequest,
} from "./contract";
import {
  abortContinuationReservation,
  commitContinuationOutcome,
  finalizeContinuationOutcome,
  ContinuationDispatchStateConflict,
  reserveContinuationDispatch,
  type ContinuationDispatchReceipt,
  type ContinuationDispatchReservation,
  type ContinuationDispatchStateEnv,
} from "./dispatch-state";
import {
  centralContinuationDispatchBody,
  ContinuationGitHubAdapterError,
  dispatchCentralContinuation,
  readAndVerifyLivePullRequest,
  type CentralContinuationDispatchResult,
  type ContinuationGitHubAdapterEnv,
  type VerifiedLivePullRequest,
} from "./github-adapter";
import {
  signContinuationReceipt,
  type ContinuationReceiptSigningEnv,
  type SignedContinuationReceipt,
} from "./receipt";

const MAX_BODY_BYTES = 8_192;
const BODY_READ_DEADLINE_MS = 10_000;
const JSON_MEDIA_TYPE = /^[ \t]*application\/json[ \t]*(?:;[ \t]*charset[ \t]*=[ \t]*utf-8[ \t]*)?$/iu;

/** Runtime authority required by the public continuation-dispatch handler, including state, GitHub adapters, receipt signing, and exact workflow revision. */
export interface ContinuationDispatchHandlerEnv
  extends ContinuationDispatchStateEnv,
    ContinuationGitHubAdapterEnv,
    ContinuationReceiptSigningEnv {
  readonly ALLOWED_WORKFLOW_SHA?: string;
}

/** Injected cryptographic and external boundaries used by the production handler and focused tests. */
export interface ContinuationDispatchHandlerDependencies {
  verifyOidc(token: string, env: ContinuationDispatchHandlerEnv): Promise<JwtPayload>;
  claimOidc(claims: JwtPayload, env: ContinuationDispatchHandlerEnv): Promise<boolean>;
  readLivePullRequest(
    claims: JwtPayload,
    request: ContinuationDispatchRequest,
    env: ContinuationDispatchHandlerEnv,
  ): Promise<VerifiedLivePullRequest>;
  reserve(
    env: ContinuationDispatchStateEnv,
    identity: string,
    digest: string,
  ): Promise<ContinuationDispatchReservation>;
  dispatch(
    request: ContinuationDispatchRequest,
    env: ContinuationGitHubAdapterEnv,
    beforeDispatch: () => Promise<void>,
  ): Promise<CentralContinuationDispatchResult>;
  commit: typeof commitContinuationOutcome;
  abort: typeof abortContinuationReservation;
  finalize: typeof finalizeContinuationOutcome;
}

/** Default owner implementations for every boundary except the existing OIDC verifier/replay claimant. */
export const continuationDispatchDependencies = {
  readLivePullRequest: readAndVerifyLivePullRequest,
  reserve: reserveContinuationDispatch,
  dispatch: dispatchCentralContinuation,
  commit: commitContinuationOutcome,
  abort: abortContinuationReservation,
  finalize: finalizeContinuationOutcome,
};

type HandlerErrorCode = Extract<
  ErrorCode,
  | "ERR_DISPATCH_REQUEST_INVALID"
  | "ERR_DISPATCH_IDENTITY_DENIED"
  | "ERR_DISPATCH_LIVE_STATE_STALE"
  | "ERR_DISPATCH_REPLAY_CONFLICT"
  | "ERR_GITHUB_DISPATCH_AUTHORIZATION"
  | "ERR_GITHUB_DISPATCH_UPSTREAM"
>;

function responseHeaders(traceId: string, startedAt: number): Headers {
  return new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    pragma: "no-cache",
    "x-content-type-options": "nosniff",
    "x-trace-id": traceId,
    "x-latency-ms": String(Math.round(performance.now() - startedAt)),
  });
}

function errorResponse(
  code: HandlerErrorCode,
  status: number,
  message: string,
  traceId: string,
  startedAt: number,
  details?: Record<string, unknown>,
): Response {
  const headers = responseHeaders(traceId, startedAt);
  if (status === 405) headers.set("allow", "POST");
  if (status === 401) headers.set("www-authenticate", 'Bearer realm="noema", error="invalid_token"');
  return new Response(JSON.stringify({
    ok: false,
    error_code: code,
    message,
    details: { hint: errorHints[code], ...(details ?? {}) },
    trace_id: traceId,
  }), { status, headers });
}

function successResponse(
  receipt: unknown,
  traceId: string,
  startedAt: number,
  replay = false,
): Response {
  const headers = responseHeaders(traceId, startedAt);
  headers.set("x-oidc-replay-protection", "verified-before-dispatch");
  if (replay) headers.set("x-continuation-replay", "exact");
  return new Response(JSON.stringify({ ok: true, data: { receipt }, trace_id: traceId }), {
    status: 200,
    headers,
  });
}

function replayResponse(
  reservation: Extract<ContinuationDispatchReservation, { kind: "replay" }>,
  traceId: string,
  startedAt: number,
): Response {
  if (reservation.outcome === "accepted") {
    return successResponse(reservation.receipt, traceId, startedAt, true);
  }
  const response = errorResponse(
    reservation.outcome === "denied"
      ? "ERR_GITHUB_DISPATCH_AUTHORIZATION"
      : "ERR_GITHUB_DISPATCH_UPSTREAM",
    reservation.outcome === "denied" ? 502 : 503,
    reservation.outcome === "denied"
      ? "GitHub rejected the fixed continuation dispatch"
      : "GitHub continuation dispatch outcome is indeterminate",
    traceId,
    startedAt,
    { receipt: reservation.receipt },
  );
  response.headers.set("x-continuation-replay", "exact");
  return response;
}

function cancelBestEffort(body: ReadableStream<Uint8Array> | null, reason: string): void {
  if (body === null) return;
  try {
    void body.cancel(reason).catch(() => undefined);
  } catch {
    // Rejection is already authoritative; cleanup must not replace it.
  }
}

function isUnavailableBoundary(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { status?: unknown };
  return typeof candidate.status === "number"
    && Number.isInteger(candidate.status)
    && candidate.status >= 500
    && candidate.status <= 599;
}

async function readBoundedBody(request: Request): Promise<string | Response> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!JSON_MEDIA_TYPE.test(contentType)) {
    cancelBestEffort(request.body, "continuation dispatch requires application/json");
    return new Response(null, { status: 415 });
  }
  const length = request.headers.get("content-length");
  if (length !== null && (!/^(?:0|[1-9][0-9]*)$/u.test(length) || Number(length) > MAX_BODY_BYTES)) {
    cancelBestEffort(request.body, "continuation dispatch body exceeds its byte envelope");
    return new Response(null, { status: 413 });
  }
  if (request.body === null) return "";
  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = request.body.getReader();
  } catch {
    return new Response(null, { status: 400 });
  }
  const bytes = new Uint8Array(MAX_BODY_BYTES);
  let used = 0;
  let timeoutHandle!: ReturnType<typeof setTimeout>;
  const cancelReaderBestEffort = (reason: string) => {
    try {
      void reader.cancel(reason).catch(() => undefined);
    } catch {
      // Cleanup must not replace an established body decision.
    }
  };
  const deadline = new Promise<Response>((resolve) => {
    timeoutHandle = setTimeout(() => {
      cancelReaderBestEffort("continuation dispatch body read deadline exceeded");
      resolve(new Response(null, { status: 408 }));
    }, BODY_READ_DEADLINE_MS);
  });
  const readBody = (async (): Promise<string | Response> => {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (chunk.value.byteLength > MAX_BODY_BYTES - used) {
        cancelReaderBestEffort("continuation dispatch body exceeds its byte envelope");
        return new Response(null, { status: 413 });
      }
      bytes.set(chunk.value, used);
      used += chunk.value.byteLength;
    }
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, used));
  })();
  try {
    return await Promise.race([readBody, deadline]);
  } catch {
    return new Response(null, { status: 400 });
  } finally {
    clearTimeout(timeoutHandle);
    try {
      reader.releaseLock();
    } catch {
      // A pending cancellation can retain the lock briefly without changing the response.
    }
  }
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function emittedPayloadDigest(request: ContinuationDispatchRequest): Promise<string> {
  return sha256(centralContinuationDispatchBody(request));
}

function workflowIdentity(claims: JwtPayload, env: ContinuationDispatchHandlerEnv): {
  workflowRef: string;
  workflowSha: string;
  iat: number;
  exp: number;
} | undefined {
  const workflowRef = claims.job_workflow_ref ?? claims.workflow_ref;
  const workflowSha = claims.job_workflow_ref ? claims.job_workflow_sha : claims.workflow_sha;
  if (
    typeof workflowRef !== "string"
    || typeof workflowSha !== "string"
    || workflowSha !== env.ALLOWED_WORKFLOW_SHA
    || !Number.isSafeInteger(claims.iat)
    || !Number.isSafeInteger(claims.exp)
  ) {
    return undefined;
  }
  return { workflowRef, workflowSha, iat: claims.iat!, exp: claims.exp! };
}

/**
 * Executes one versioned, credential-free continuation dispatch from bounded request through signed evidence.
 * Exact replays return retained evidence and all uncertain external outcomes become terminal before responding.
 * @param request Bounded public HTTP request whose method, media type, bearer, and closed JSON body are admitted here.
 * @param env Typed Worker bindings for exact workflow trust, GitHub adapters, durable state, and receipt signing.
 * @param traceId Non-secret canonical request correlation identifier.
 * @param dependencies Injected verification, state, and dispatch boundaries used by production and tests.
 * @returns A standard no-store JSON response containing either one signed receipt or a stable dispatch error.
 */
export async function handleContinuationDispatch(
  request: Request,
  env: ContinuationDispatchHandlerEnv,
  traceId: string,
  dependencies: ContinuationDispatchHandlerDependencies,
): Promise<Response> {
  const startedAt = performance.now();
  if (request.method !== "POST") {
    cancelBestEffort(request.body, "continuation dispatch method is not allowed");
    return errorResponse("ERR_DISPATCH_REQUEST_INVALID", 405, "Method not allowed", traceId, startedAt);
  }

  const body = await readBoundedBody(request);
  if (body instanceof Response) {
    const status = body.status;
    return errorResponse(
      "ERR_DISPATCH_REQUEST_INVALID",
      status,
      status === 415
        ? "Continuation dispatch requires application/json"
        : status === 408
          ? "Continuation dispatch body read deadline exceeded"
          : "Continuation dispatch body is invalid",
      traceId,
      startedAt,
    );
  }

  let parsed: ContinuationDispatchRequest;
  try {
    parsed = parseContinuationDispatchRequest(body);
  } catch {
    return errorResponse("ERR_DISPATCH_REQUEST_INVALID", 400, "Continuation dispatch request is invalid", traceId, startedAt);
  }

  const bearer = parseExactBearerToken(request.headers.get("authorization") ?? "");
  if (bearer === undefined) {
    return errorResponse("ERR_DISPATCH_IDENTITY_DENIED", 401, "Missing or invalid bearer token", traceId, startedAt);
  }

  let claims: JwtPayload;
  try {
    claims = await dependencies.verifyOidc(bearer, env);
  } catch (error) {
    if (isUnavailableBoundary(error)) {
      return errorResponse("ERR_GITHUB_DISPATCH_UPSTREAM", 503, "OIDC verification unavailable", traceId, startedAt);
    }
    return errorResponse("ERR_DISPATCH_IDENTITY_DENIED", 401, "Continuation identity was denied", traceId, startedAt);
  }
  const workflow = workflowIdentity(claims, env);
  if (workflow === undefined || claims.repository !== parsed.source_repository) {
    return errorResponse("ERR_DISPATCH_IDENTITY_DENIED", 403, "Continuation identity was denied", traceId, startedAt);
  }

  try {
    if (!await dependencies.claimOidc(claims, env)) {
      return errorResponse("ERR_DISPATCH_IDENTITY_DENIED", 401, "Continuation identity was already used or unavailable", traceId, startedAt);
    }
  } catch (error) {
    if (isUnavailableBoundary(error)) {
      return errorResponse("ERR_GITHUB_DISPATCH_UPSTREAM", 503, "OIDC replay protection unavailable", traceId, startedAt);
    }
    return errorResponse("ERR_DISPATCH_IDENTITY_DENIED", 401, "Continuation identity was already used or unavailable", traceId, startedAt);
  }

  const digest = await continuationRequestDigest(parsed, { workflow_sha: workflow.workflowSha });
  const identity = await continuationDispatchIdentity(parsed, { workflow_sha: workflow.workflowSha });
  let reservation: ContinuationDispatchReservation;
  try {
    reservation = await dependencies.reserve(env, identity, digest);
  } catch (error) {
    if (error instanceof ContinuationDispatchStateConflict) {
      return errorResponse("ERR_DISPATCH_REPLAY_CONFLICT", 409, "Continuation replay conflicts with retained authority", traceId, startedAt);
    }
    return errorResponse("ERR_GITHUB_DISPATCH_UPSTREAM", 503, "Continuation state unavailable", traceId, startedAt);
  }
  if (reservation.kind === "in_progress") {
    return errorResponse("ERR_DISPATCH_REPLAY_CONFLICT", 409, "Continuation dispatch is already in progress", traceId, startedAt);
  }
  if (reservation.kind === "replay") {
    return replayResponse(reservation, traceId, startedAt);
  }

  try {
    await dependencies.readLivePullRequest(claims, parsed, env);
  } catch (error) {
    try {
      await dependencies.abort(env, reservation);
    } catch {
      return errorResponse("ERR_GITHUB_DISPATCH_UPSTREAM", 503, "Continuation reservation could not be released", traceId, startedAt);
    }
    if (error instanceof ContinuationGitHubAdapterError) {
      if (error.classification === "identity_denied") {
        return errorResponse("ERR_DISPATCH_IDENTITY_DENIED", 403, "Continuation identity was denied", traceId, startedAt);
      }
      if (error.classification === "live_state_stale") {
        return errorResponse("ERR_DISPATCH_LIVE_STATE_STALE", 409, "Pull request state no longer matches", traceId, startedAt);
      }
    }
    return errorResponse("ERR_GITHUB_DISPATCH_UPSTREAM", 503, "GitHub live-state verification unavailable", traceId, startedAt);
  }

  const receiptId = crypto.randomUUID();
  const payloadDigest = await emittedPayloadDigest(parsed);
  let indeterminateReceipt: SignedContinuationReceipt;
  try {
    indeterminateReceipt = await signContinuationReceipt({
      request: parsed,
      requestDigest: digest,
      idempotencyIdentity: identity,
      workflowRef: workflow.workflowRef,
      workflowSha: workflow.workflowSha,
      emittedPayloadDigest: payloadDigest,
      dispatchResult: {
        outcome: "indeterminate",
        eventType: dispatchMapping(parsed.dispatch_action).eventType,
      },
      oidcLifetime: { iat: workflow.iat, exp: workflow.exp },
      receiptId,
      traceId,
    }, env);
  } catch {
    try {
      await dependencies.abort(env, reservation);
    } catch {
      return errorResponse("ERR_GITHUB_DISPATCH_UPSTREAM", 503, "Continuation reservation could not be released", traceId, startedAt);
    }
    return errorResponse("ERR_GITHUB_DISPATCH_UPSTREAM", 503, "Continuation evidence could not be signed", traceId, startedAt);
  }

  let evidenceCommitted = false;
  let dispatchResult: CentralContinuationDispatchResult;
  try {
    dispatchResult = await dependencies.dispatch(parsed, env, async () => {
      await dependencies.commit(
        env,
        reservation,
        indeterminateReceipt as unknown as ContinuationDispatchReceipt,
      );
      evidenceCommitted = true;
    });
  } catch {
    if (!evidenceCommitted) {
      try {
        await dependencies.abort(env, reservation);
      } catch {
        // An ambiguous commit may already have retained indeterminate evidence.
      }
      return errorResponse("ERR_GITHUB_DISPATCH_UPSTREAM", 503, "Continuation dispatch could not be prepared", traceId, startedAt);
    }
    dispatchResult = { outcome: "indeterminate", eventType: dispatchMapping(parsed.dispatch_action).eventType };
  }

  if (!(["accepted", "denied", "indeterminate"] as readonly unknown[]).includes(dispatchResult.outcome)) {
    return errorResponse("ERR_GITHUB_DISPATCH_UPSTREAM", 503, "Unexpected continuation outcome", traceId, startedAt);
  }

  if (dispatchResult.outcome === "indeterminate") {
    return errorResponse(
      "ERR_GITHUB_DISPATCH_UPSTREAM",
      503,
      "GitHub continuation dispatch outcome is indeterminate",
      traceId,
      startedAt,
      { receipt: indeterminateReceipt },
    );
  }

  let receipt: SignedContinuationReceipt;
  try {
    receipt = await signContinuationReceipt({
      request: parsed,
      requestDigest: digest,
      idempotencyIdentity: identity,
      workflowRef: workflow.workflowRef,
      workflowSha: workflow.workflowSha,
      emittedPayloadDigest: payloadDigest,
      dispatchResult,
      oidcLifetime: { iat: workflow.iat, exp: workflow.exp },
      receiptId,
      traceId,
    }, env);
    await dependencies.finalize(
      env,
      reservation,
      receipt as unknown as ContinuationDispatchReceipt,
    );
  } catch {
    return errorResponse(
      "ERR_GITHUB_DISPATCH_UPSTREAM",
      503,
      "Continuation final evidence could not be committed",
      traceId,
      startedAt,
      { receipt: indeterminateReceipt },
    );
  }

  if (dispatchResult.outcome === "accepted") {
    return successResponse(receipt, traceId, startedAt);
  }
  return errorResponse(
    "ERR_GITHUB_DISPATCH_AUTHORIZATION",
    502,
    "GitHub rejected the fixed continuation dispatch",
    traceId,
    startedAt,
    { receipt },
  );
}
