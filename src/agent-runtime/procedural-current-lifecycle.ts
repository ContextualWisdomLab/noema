import { guideProceduralExecution, type ProceduralExecutionGuidance } from "./procedural-execution";
import type { ExecutionLifecycle, ExecutionState } from "./execution-lifecycle";
import type { ProceduralSession } from "./procedural-graph";
import {
  routeWorkflowStateCommand,
  type WorkflowStateDurableObjectEnv,
} from "../workflow-task-execution/workflow-state-durable-object";
import {
  admitWorkflowTaskPlan,
  type AdmittedWorkflowTaskPlan,
  type WorkflowTaskPlan,
} from "../workflow-task-execution/task-plan";

const CURRENT_WORKFLOW_TASK_STATES: ReadonlySet<CurrentWorkflowTaskState> = new Set([
  "pending",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "blocked",
]);
const TERMINAL_WORKFLOW_TASK_STATES: ReadonlySet<CurrentWorkflowTaskState> = new Set([
  "succeeded",
  "failed",
  "cancelled",
  "blocked",
]);
const AUTHORITY_ID_PATTERN = /^[\x21-\x7e]{1,128}$/u;
const MAX_CURRENT_WORKFLOW_RESPONSE_BYTES = 1024 * 1024;
const CURRENT_WORKFLOW_RESPONSE_READ_DEADLINE_MS = 10_000;
const CURRENT_WORKFLOW_RESPONSE_READ_DEADLINE = Symbol("current-workflow-response-read-deadline");

type CurrentWorkflowTaskState = "pending" | "running" | "succeeded" | "failed" | "cancelled" | "blocked";

type CurrentWorkflowEvidence = {
  readonly executionId: string;
  readonly cancellationRequested: boolean;
  readonly taskStates: readonly CurrentWorkflowTaskState[];
  readonly transitionSequence: number;
};

/**
 * Stable diagnostic codes for failures while obtaining current Workflow / Task Execution evidence;
 * none of these codes grants retry, lifecycle transition, Policy / Approval, or tool authority.
 */
export type ProceduralCurrentLifecycleErrorCode =
  | "workflow_state_conflict"
  | "workflow_state_unavailable"
  | "invalid_workflow_state_response";

/**
 * Fail-closed error raised when the canonical durable Workflow / Task Execution owner cannot provide
 * trustworthy current evidence for the procedural-guidance ACL. This diagnostic is not authority.
 */
export class ProceduralCurrentLifecycleError extends Error {
  readonly code: ProceduralCurrentLifecycleErrorCode;

  constructor(code: ProceduralCurrentLifecycleErrorCode) {
    super(code);
    this.name = "ProceduralCurrentLifecycleError";
    this.code = code;
  }
}

function rejectCurrentLifecycle(code: ProceduralCurrentLifecycleErrorCode): never {
  throw new ProceduralCurrentLifecycleError(code);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function currentTaskState(value: unknown): CurrentWorkflowTaskState {
  if (typeof value !== "string" || !CURRENT_WORKFLOW_TASK_STATES.has(value as CurrentWorkflowTaskState)) {
    return rejectCurrentLifecycle("invalid_workflow_state_response");
  }
  return value as CurrentWorkflowTaskState;
}

function currentWorkflowEvidence(
  value: unknown,
  plan: AdmittedWorkflowTaskPlan,
): CurrentWorkflowEvidence {
  if (!isRecord(value) || value.executionId !== plan.executionId || value.planId !== plan.planId) {
    return rejectCurrentLifecycle("invalid_workflow_state_response");
  }
  if (!Number.isSafeInteger(value.transitionSequence) || (value.transitionSequence as number) < 0) {
    return rejectCurrentLifecycle("invalid_workflow_state_response");
  }
  if (!isRecord(value.cancellation) || typeof value.cancellation.requested !== "boolean") {
    return rejectCurrentLifecycle("invalid_workflow_state_response");
  }
  const cancellationId = value.cancellation.cancellationId;
  if (
    (value.cancellation.requested && (typeof cancellationId !== "string" || !AUTHORITY_ID_PATTERN.test(cancellationId)))
    || (!value.cancellation.requested && cancellationId !== null)
  ) {
    return rejectCurrentLifecycle("invalid_workflow_state_response");
  }
  if (!Array.isArray(value.tasks) || value.tasks.length !== plan.tasks.length) {
    return rejectCurrentLifecycle("invalid_workflow_state_response");
  }

  const expectedTaskIds = new Set(plan.tasks.map(({ taskId }) => taskId));
  const observedTaskIds = new Set<string>();
  const taskStates: CurrentWorkflowTaskState[] = [];
  for (const task of value.tasks) {
    if (!isRecord(task) || typeof task.taskId !== "string") {
      return rejectCurrentLifecycle("invalid_workflow_state_response");
    }
    if (!expectedTaskIds.has(task.taskId) || observedTaskIds.has(task.taskId)) {
      return rejectCurrentLifecycle("invalid_workflow_state_response");
    }
    observedTaskIds.add(task.taskId);
    taskStates.push(currentTaskState(task.state));
  }

  return Object.freeze({
    executionId: plan.executionId,
    cancellationRequested: value.cancellation.requested,
    taskStates: Object.freeze(taskStates),
    transitionSequence: value.transitionSequence as number,
  });
}

/**
 * Reads one private Workflow / Task Execution response into fixed retained storage before JSON admission.
 * The byte ceiling is deliberately much larger than the bounded workflow snapshot schema but prevents a
 * corrupt internal response from making Agent Runtime retain an unbounded body before fail-closed validation.
 * Reader acquisition is itself part of the untrusted response boundary: a locked body is normalized to the
 * same stable invalid-response diagnostic instead of leaking a raw stream exception. An absolute ten-second
 * read deadline prevents an admitted HTTP 200 response from pinning procedural guidance forever when no chunk
 * ever arrives. Oversize or timed-out streams request cancellation, but cancellation completion is cleanup
 * rather than decision authority; it cannot delay or replace the stable fail-closed diagnostic. The reader
 * lock is released on every terminal path independently of cancellation success.
 */
async function boundedCurrentWorkflowResponse(response: Response): Promise<unknown> {
  if (response.body === null) {
    return rejectCurrentLifecycle("invalid_workflow_state_response");
  }

  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = response.body.getReader();
  } catch {
    return rejectCurrentLifecycle("invalid_workflow_state_response");
  }
  const storage = new Uint8Array(MAX_CURRENT_WORKFLOW_RESPONSE_BYTES);
  let totalBytes = 0;
  let deadlineHandle: ReturnType<typeof setTimeout> | undefined;
  const readDeadline = new Promise<never>((_resolve, reject) => {
    deadlineHandle = setTimeout(
      () => reject(CURRENT_WORKFLOW_RESPONSE_READ_DEADLINE),
      CURRENT_WORKFLOW_RESPONSE_READ_DEADLINE_MS,
    );
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), readDeadline]);
      if (done) break;
      if (!(value instanceof Uint8Array)) {
        return rejectCurrentLifecycle("invalid_workflow_state_response");
      }
      if (value.byteLength > MAX_CURRENT_WORKFLOW_RESPONSE_BYTES - totalBytes) {
        try {
          void reader.cancel("Noema current workflow-state response exceeded byte ceiling").catch(() => undefined);
        } catch {
          // The byte-ceiling decision does not depend on cleanup transport behavior.
        }
        return rejectCurrentLifecycle("invalid_workflow_state_response");
      }
      storage.set(value, totalBytes);
      totalBytes += value.byteLength;
    }
  } catch (error) {
    if (error instanceof ProceduralCurrentLifecycleError) throw error;
    if (error === CURRENT_WORKFLOW_RESPONSE_READ_DEADLINE) {
      try {
        void reader.cancel("Noema current workflow-state response exceeded read deadline").catch(() => undefined);
      } catch {
        // The read-deadline decision does not depend on cleanup transport behavior.
      }
    }
    return rejectCurrentLifecycle("invalid_workflow_state_response");
  } finally {
    if (deadlineHandle !== undefined) clearTimeout(deadlineHandle);
    reader.releaseLock();
  }

  try {
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(storage.subarray(0, totalBytes));
    return JSON.parse(text) as unknown;
  } catch {
    return rejectCurrentLifecycle("invalid_workflow_state_response");
  }
}

async function readCurrentWorkflowEvidence(
  env: WorkflowStateDurableObjectEnv,
  plan: AdmittedWorkflowTaskPlan,
): Promise<CurrentWorkflowEvidence> {
  let response: Response;
  try {
    response = await routeWorkflowStateCommand(env, { operation: "read", plan });
  } catch {
    return rejectCurrentLifecycle("workflow_state_unavailable");
  }

  if (response.status === 409) return rejectCurrentLifecycle("workflow_state_conflict");
  if (response.status === 503) return rejectCurrentLifecycle("workflow_state_unavailable");
  if (response.status !== 200) return rejectCurrentLifecycle("invalid_workflow_state_response");

  const body = await boundedCurrentWorkflowResponse(response);
  if (!isRecord(body) || body.ok !== true) {
    return rejectCurrentLifecycle("invalid_workflow_state_response");
  }
  return currentWorkflowEvidence(body.data, plan);
}

function proceduralGateState(evidence: CurrentWorkflowEvidence): ExecutionState {
  if (evidence.cancellationRequested) return "cancellation_requested";

  if (evidence.taskStates.every((state) => TERMINAL_WORKFLOW_TASK_STATES.has(state))) {
    if (evidence.taskStates.some((state) => state === "failed" || state === "blocked")) return "failed";
    if (evidence.taskStates.some((state) => state === "cancelled")) return "cancelled";
    return "succeeded";
  }

  if (evidence.transitionSequence <= 1 && evidence.taskStates.every((state) => state === "pending")) {
    return "accepted";
  }
  return "running";
}

/**
 * Re-reads Noema's canonical execution-scoped Workflow / Task Execution Durable Object before each
 * procedural-guidance decision, then projects only the minimum conservative lifecycle state needed
 * to suppress stale advice. The locally admitted procedural session is first checked against the
 * re-admitted plan execution identity, before any Durable Object lookup, so a cross-execution caller
 * cannot use this ACL to read another execution's workflow-state authority. The projection is an
 * Agent Runtime ACL input, not a second lifecycle store: cancellation and terminal durable task
 * evidence can remove guidance authority, while this function cannot create task claims, lifecycle
 * transitions, retries, approvals, tools, or product truth. A successful source-level read is still
 * not production latency evidence; any synchronous buyer/runtime use must separately measure the
 * deployed Durable Object path against its p95 target.
 *
 * @param env Existing Noema workflow-state Durable Object binding that owns current task authority.
 * @param plan Untrusted workflow plan re-admitted and bound to the execution-scoped durable owner.
 * @param session Locally admitted execution-pinned procedural graph session used only for advisory context.
 * @param request Bounded procedural neighborhood request, read only when fresh evidence projects running work.
 * @returns Frozen procedural guidance produced by the existing Agent Runtime gate from fresh durable evidence.
 */
export async function guideProceduralExecutionFromCurrentWorkflowState(
  env: WorkflowStateDurableObjectEnv,
  plan: WorkflowTaskPlan,
  session: ProceduralSession,
  request: unknown,
): Promise<ProceduralExecutionGuidance> {
  const admittedPlan = admitWorkflowTaskPlan(plan);

  // Validate the local Agent Runtime session/execution binding before selecting or reading a
  // Workflow / Task Execution Durable Object. The accepted state guarantees `request` is not read.
  guideProceduralExecution(
    Object.freeze({ executionId: admittedPlan.executionId, state: "accepted" }),
    session,
    null,
  );

  const evidence = await readCurrentWorkflowEvidence(env, admittedPlan);
  const lifecycle: ExecutionLifecycle = Object.freeze({
    executionId: evidence.executionId,
    state: proceduralGateState(evidence),
  });
  return guideProceduralExecution(lifecycle, session, request);
}
