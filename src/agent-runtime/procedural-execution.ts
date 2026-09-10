import type { ExecutionLifecycle, ExecutionState } from "./execution-lifecycle";
import { assertProceduralSession } from "./procedural-graph";
import type { ProceduralContext, ProceduralSession } from "./procedural-graph";
import { isCanonicalExecutionId } from "../runtime-shared/execution-identity";

/** Canonical reason explaining whether one lifecycle-bound execution may receive advisory procedural context without changing runtime authority. */
export type ProceduralExecutionReason =
  | "running_execution"
  | "execution_not_started"
  | "cancellation_requested"
  | "terminal_execution";

/** Frozen result binding guidance availability, lifecycle state, graph digest, and optional advisory context to one exact execution identity. */
export interface ProceduralExecutionGuidance {
  readonly available: boolean;
  readonly reason: ProceduralExecutionReason;
  readonly executionId: string;
  readonly graphDigest: string;
  readonly lifecycleState: ExecutionState;
  readonly context: ProceduralContext | null;
}

const executionErrors = new WeakSet<object>();
const EXECUTION_STATES = new Set<ExecutionState>([
  "accepted",
  "running",
  "cancellation_requested",
  "succeeded",
  "failed",
  "cancelled",
]);

/** Error raised when malformed lifecycle data or an execution/session identity mismatch would otherwise let advisory context escape its bound runtime execution. */
export class ProceduralExecutionError extends Error {
  constructor(code: string) {
    super(code);
    this.name = "ProceduralExecutionError";
    executionErrors.add(this);
  }
}

function rejectExecution(code: string): never {
  throw new ProceduralExecutionError(code);
}

function normalizeExecutionError(error: unknown): never {
  if (typeof error === "object" && error !== null && executionErrors.has(error)) throw error;
  throw new ProceduralExecutionError("invalid_execution_lifecycle");
}

function requireProceduralSession(session: unknown): asserts session is ProceduralSession {
  try {
    assertProceduralSession(session);
  } catch {
    rejectExecution("invalid_procedural_session");
  }
}

function readLifecycle(value: unknown): ExecutionLifecycle {
  if (value === null || typeof value !== "object" || Array.isArray(value)) rejectExecution("invalid_execution_lifecycle");
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) rejectExecution("invalid_execution_lifecycle");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== 2 || !Object.hasOwn(descriptors, "executionId") || !Object.hasOwn(descriptors, "state")) {
    rejectExecution("invalid_execution_lifecycle");
  }
  const executionDescriptor = descriptors.executionId;
  const stateDescriptor = descriptors.state;
  if (!Object.hasOwn(executionDescriptor, "value") || !Object.hasOwn(stateDescriptor, "value")) {
    rejectExecution("invalid_execution_lifecycle");
  }
  const executionId = executionDescriptor.value;
  const state = stateDescriptor.value;
  if (!isCanonicalExecutionId(executionId) || typeof state !== "string" || !EXECUTION_STATES.has(state as ExecutionState)) {
    rejectExecution("invalid_execution_lifecycle");
  }
  return Object.freeze({executionId, state: state as ExecutionState});
}

function unavailable(
  lifecycle: ExecutionLifecycle,
  session: ProceduralSession,
  reason: Exclude<ProceduralExecutionReason, "running_execution">,
): ProceduralExecutionGuidance {
  return Object.freeze({
    available: false,
    reason,
    executionId: lifecycle.executionId,
    graphDigest: session.graphDigest,
    lifecycleState: lifecycle.state,
    context: null,
  });
}

/**
 * Reads procedural advice only for an actively running execution whose immutable graph session
 * is bound to the same canonical execution identity.
 *
 * The session must carry the module-local runtime admission brand; structural lookalikes are
 * rejected before any session property or callback is read. The lifecycle remains authoritative:
 * accepted executions receive no pre-start advice, cancellation suppresses further planning, and
 * terminal executions never reopen through a procedural suggestion. The request is deliberately
 * not inspected in those unavailable states. A running result is still advisory-only because the
 * returned context comes from `ProceduralSession`; this adapter does not grant tool, retry,
 * approval, or transition authority.
 *
 * @param lifecycle Current Noema lifecycle snapshot produced by the Agent Runtime boundary.
 * @param session Execution-pinned procedural graph session created by `startProceduralSession`.
 * @param request Localized graph-neighborhood request forwarded only while execution is running.
 * @returns Frozen guidance availability and, only for a running execution, advisory context.
 */
export function guideProceduralExecution(
  lifecycle: ExecutionLifecycle,
  session: ProceduralSession,
  request: unknown,
): ProceduralExecutionGuidance {
  try {
    requireProceduralSession(session);
    const retained = readLifecycle(lifecycle);
    if (!isCanonicalExecutionId(session.executionId) || retained.executionId !== session.executionId) {
      rejectExecution("execution_identity_mismatch");
    }

    switch (retained.state) {
      case "accepted":
        return unavailable(retained, session, "execution_not_started");
      case "cancellation_requested":
        return unavailable(retained, session, "cancellation_requested");
      case "succeeded":
      case "failed":
      case "cancelled":
        return unavailable(retained, session, "terminal_execution");
      case "running": {
        const context = session.context(request);
        if (context.executionId !== retained.executionId || context.graphDigest !== session.graphDigest) {
          rejectExecution("execution_identity_mismatch");
        }
        return Object.freeze({
          available: true,
          reason: "running_execution" as const,
          executionId: retained.executionId,
          graphDigest: session.graphDigest,
          lifecycleState: retained.state,
          context,
        });
      }
    }
  } catch (error) {
    return normalizeExecutionError(error);
  }
}
