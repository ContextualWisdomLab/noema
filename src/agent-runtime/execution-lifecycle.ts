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

const TERMINAL_EXECUTION_STATES = new Set<ExecutionState>(["succeeded", "failed", "cancelled"]);

const EXECUTION_TRANSITIONS: Readonly<
  Partial<Record<ExecutionState, Readonly<Partial<Record<ExecutionSignal, ExecutionState>>>>>
> = {
  accepted: {
    start: "running",
    request_cancellation: "cancellation_requested",
  },
  running: {
    request_cancellation: "cancellation_requested",
    complete_success: "succeeded",
    complete_failure: "failed",
  },
  cancellation_requested: {
    confirm_cancelled: "cancelled",
  },
};

/** Raised when a caller attempts to manufacture an execution state outside the lifecycle contract. */
export class ExecutionLifecycleError extends Error {
  /** State from which the invalid transition was attempted. */
  readonly currentState: ExecutionState;

  /** Signal rejected by the lifecycle authority. */
  readonly signal: ExecutionSignal;

  constructor(currentState: ExecutionState, signal: ExecutionSignal) {
    super(`invalid execution lifecycle transition: ${currentState} -> ${signal}`);
    this.name = "ExecutionLifecycleError";
    this.currentState = currentState;
    this.signal = signal;
  }
}

/** Returns whether an execution has reached an immutable terminal outcome. */
export function isTerminalExecutionState(state: ExecutionState): boolean {
  return TERMINAL_EXECUTION_STATES.has(state);
}

/**
 * Applies one explicit lifecycle signal.
 *
 * Cancellation is authoritative once requested: success/failure arriving afterward is rejected as
 * stale instead of silently overriding the cancellation decision. Retry/recovery creates a separate
 * execution identity and therefore is intentionally outside this state machine.
 */
export function transitionExecutionLifecycle(currentState: ExecutionState, signal: ExecutionSignal): ExecutionState {
  const nextState = EXECUTION_TRANSITIONS[currentState]?.[signal];
  if (nextState === undefined) {
    throw new ExecutionLifecycleError(currentState, signal);
  }
  return nextState;
}
