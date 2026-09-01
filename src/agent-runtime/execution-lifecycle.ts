import { isCanonicalExecutionId } from "../runtime-shared/execution-identity";

/** Lifecycle states owned by Noema's Agent Runtime bounded context. */
export type ExecutionState =
  | "accepted"
  | "running"
  | "cancellation_requested"
  | "succeeded"
  | "failed"
  | "cancelled";

/** Signals that may advance one execution without creating retry or side-effect authority. */
export type ExecutionSignal =
  | "start"
  | "request_cancellation"
  | "complete_success"
  | "complete_failure"
  | "confirm_cancelled";

/** Retained lifecycle authority for exactly one execution identity. */
export interface ExecutionLifecycle {
  readonly executionId: string;
  readonly state: ExecutionState;
}

/** One lifecycle signal bound to the execution identity it is allowed to advance. */
export interface ExecutionSignalEnvelope {
  readonly executionId: string;
  readonly signal: ExecutionSignal;
}

const EXECUTION_STATES = new Set<ExecutionState>([
  "accepted",
  "running",
  "cancellation_requested",
  "succeeded",
  "failed",
  "cancelled",
]);

const EXECUTION_SIGNALS = new Set<ExecutionSignal>([
  "start",
  "request_cancellation",
  "complete_success",
  "complete_failure",
  "confirm_cancelled",
]);

const TERMINAL_EXECUTION_STATES = new Set<ExecutionState>(["succeeded", "failed", "cancelled"]);

const EXECUTION_TRANSITIONS: Readonly<
  Partial<Record<ExecutionState, Readonly<Partial<Record<ExecutionSignal, ExecutionState>>>>>
> = {
  accepted: {
    start: "running",
    request_cancellation: "cancellation_requested",
  },
  running: {
    start: "running",
    request_cancellation: "cancellation_requested",
    complete_success: "succeeded",
    complete_failure: "failed",
  },
  cancellation_requested: {
    request_cancellation: "cancellation_requested",
    confirm_cancelled: "cancelled",
  },
  succeeded: {
    complete_success: "succeeded",
  },
  failed: {
    complete_failure: "failed",
  },
  cancelled: {
    confirm_cancelled: "cancelled",
  },
};

/** Raised when a caller attempts to manufacture execution authority outside the lifecycle contract. */
export class ExecutionLifecycleError extends Error {
  /** Canonical state from which the rejected signal was observed, or null for malformed runtime input. */
  readonly currentState: ExecutionState | null;

  /** Canonical signal rejected by the lifecycle authority, or null for malformed runtime input. */
  readonly signal: ExecutionSignal | null;

  constructor(currentState: ExecutionState | null, signal: ExecutionSignal | null, message?: string) {
    super(message ?? `invalid execution lifecycle transition: ${currentState} -> ${signal}`);
    this.name = "ExecutionLifecycleError";
    this.currentState = currentState;
    this.signal = signal;
  }
}

function isExecutionState(value: unknown): value is ExecutionState {
  return typeof value === "string" && EXECUTION_STATES.has(value as ExecutionState);
}

function isExecutionSignal(value: unknown): value is ExecutionSignal {
  return typeof value === "string" && EXECUTION_SIGNALS.has(value as ExecutionSignal);
}

/** Returns whether an execution has reached an immutable terminal outcome. */
export function isTerminalExecutionState(state: ExecutionState): boolean {
  return TERMINAL_EXECUTION_STATES.has(state);
}

function snapshotLifecycle(lifecycle: ExecutionLifecycle): ExecutionLifecycle {
  return Object.freeze({
    executionId: lifecycle.executionId,
    state: lifecycle.state,
  });
}

function snapshotSignal(envelope: ExecutionSignalEnvelope): ExecutionSignalEnvelope {
  return Object.freeze({
    executionId: envelope.executionId,
    signal: envelope.signal,
  });
}

/**
 * Applies one explicit lifecycle signal to the execution identity that owns the retained state.
 *
 * Inputs are snapshotted before validation so accessors or proxies cannot change authority between
 * identity checks and transition lookup. Runtime state and signal values must be actual canonical
 * strings before they can select a transition; JavaScript property-key coercion is never authority.
 * Exact duplicate delivery of the signal that already established the current state is idempotent;
 * contradictory or out-of-order signals fail closed. Cancellation is authoritative once requested:
 * success/failure arriving afterward is rejected as stale instead of silently overriding the
 * cancellation decision. Retry/recovery creates a separate execution identity and therefore is
 * intentionally outside this state machine.
 */
export function transitionExecutionLifecycle(
  current: ExecutionLifecycle,
  incoming: ExecutionSignalEnvelope,
): ExecutionLifecycle {
  const retained = snapshotLifecycle(current);
  const signal = snapshotSignal(incoming);

  const retainedState = isExecutionState(retained.state) ? retained.state : null;
  const incomingSignal = isExecutionSignal(signal.signal) ? signal.signal : null;

  if (retainedState === null) {
    throw new ExecutionLifecycleError(null, incomingSignal, "execution lifecycle state is not canonical");
  }
  if (incomingSignal === null) {
    throw new ExecutionLifecycleError(retainedState, null, "execution signal is not canonical");
  }
  if (!isCanonicalExecutionId(retained.executionId) || !isCanonicalExecutionId(signal.executionId)) {
    throw new ExecutionLifecycleError(retainedState, incomingSignal, "execution identity is not canonical");
  }
  if (retained.executionId !== signal.executionId) {
    throw new ExecutionLifecycleError(retainedState, incomingSignal, "execution identity mismatch");
  }

  const nextState = EXECUTION_TRANSITIONS[retainedState]?.[incomingSignal];
  if (nextState === undefined) {
    throw new ExecutionLifecycleError(retainedState, incomingSignal);
  }

  return Object.freeze({ executionId: retained.executionId, state: nextState });
}