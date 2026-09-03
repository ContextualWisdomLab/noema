import {
  CheckpointAdmissionError,
  admitExecutionCheckpoint,
  type ExecutionCheckpoint,
} from "../state-checkpoint/checkpoint-admission";
import { isCanonicalExecutionId } from "../runtime-shared/execution-identity";
import {
  WorkflowTaskPlanError,
  admitWorkflowTaskPlan,
  type WorkflowTaskPlan,
} from "./task-plan";
import {
  DurableWorkflowStateRepository,
  WorkflowStateConflictError,
  WorkflowStateStoreUnavailableError,
  type WorkflowExecutionStateSnapshot,
  type WorkflowTaskClaim,
  type WorkflowTaskTerminalOutcome,
} from "./workflow-state-store";

const WORKFLOW_STATE_INTERNAL_ENDPOINT = "https://noema-workflow-state.internal/command";
const CLAIM_ID_PATTERN = /^[\x21-\x7e]{1,128}$/u;
const TASK_ID_PATTERN = /^[\x21-\x7e]{1,128}$/u;
const workflowTaskTerminalOutcomes = new Set<WorkflowTaskTerminalOutcome>([
  "succeeded",
  "failed",
  "cancelled",
]);
const workflowStateOperations = new Set<WorkflowStateCommand["operation"]>([
  "initialize",
  "read",
  "claim_next",
  "claim_runnable",
  "mark_effect_started",
  "request_cancellation",
  "complete",
  "recover_interrupted",
  "resolve_blocked",
  "commit_checkpoint",
]);

/** Cloudflare binding required to route one execution to its single durable workflow-state authority. */
export interface WorkflowStateDurableObjectEnv {
  NOEMA_WORKFLOW_STATE: DurableObjectNamespace;
}

/** Serializable command surface used only between Noema's scheduler adapter and its private Durable Object. */
export type WorkflowStateCommand =
  | { readonly operation: "initialize"; readonly plan: WorkflowTaskPlan; readonly checkpoint: ExecutionCheckpoint }
  | { readonly operation: "read"; readonly plan: WorkflowTaskPlan }
  | { readonly operation: "claim_next"; readonly plan: WorkflowTaskPlan; readonly claimId: string }
  | {
      readonly operation: "claim_runnable";
      readonly plan: WorkflowTaskPlan;
      readonly taskId: string;
      readonly claimId: string;
    }
  | { readonly operation: "mark_effect_started"; readonly plan: WorkflowTaskPlan; readonly claim: WorkflowTaskClaim }
  | { readonly operation: "request_cancellation"; readonly plan: WorkflowTaskPlan; readonly cancellationId: string }
  | {
      readonly operation: "complete";
      readonly plan: WorkflowTaskPlan;
      readonly claim: WorkflowTaskClaim;
      readonly outcome: WorkflowTaskTerminalOutcome;
    }
  | { readonly operation: "recover_interrupted"; readonly plan: WorkflowTaskPlan; readonly claim: WorkflowTaskClaim }
  | { readonly operation: "resolve_blocked"; readonly plan: WorkflowTaskPlan }
  | {
      readonly operation: "commit_checkpoint";
      readonly plan: WorkflowTaskPlan;
      readonly expected: ExecutionCheckpoint;
      readonly candidate: ExecutionCheckpoint;
    };

type WorkflowStateCommandSuccess = {
  readonly ok: true;
  readonly data: WorkflowExecutionStateSnapshot | WorkflowTaskClaim;
};

type WorkflowStateCommandFailure = {
  readonly ok: false;
  readonly error: "invalid_request" | "conflict" | "storage_unavailable" | "internal_error";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isJsonMediaType(value: string | null): boolean {
  return /^[ \t]*application\/json[ \t]*(?:;[ \t]*charset[ \t]*=[ \t]*utf-8[ \t]*)?$/iu.test(value ?? "");
}

function jsonResponse(
  body: WorkflowStateCommandSuccess | WorkflowStateCommandFailure,
  status: number,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      pragma: "no-cache",
      "x-content-type-options": "nosniff",
    },
  });
}

function commandIdentity(value: unknown, label: string): string {
  if (typeof value !== "string" || !CLAIM_ID_PATTERN.test(value)) {
    throw new WorkflowTaskPlanError(`${label} identity is not canonical`);
  }
  return value;
}

function commandTaskId(value: unknown): string {
  if (typeof value !== "string" || !TASK_ID_PATTERN.test(value)) {
    throw new WorkflowTaskPlanError("task identity is not canonical");
  }
  return value;
}

function terminalOutcome(value: unknown): WorkflowTaskTerminalOutcome {
  if (typeof value !== "string" || !workflowTaskTerminalOutcomes.has(value as WorkflowTaskTerminalOutcome)) {
    throw new WorkflowTaskPlanError("task terminal outcome is not canonical");
  }
  return value as WorkflowTaskTerminalOutcome;
}

function workflowTaskClaim(value: unknown, plan: WorkflowTaskPlan): WorkflowTaskClaim {
  if (!isRecord(value)) {
    throw new WorkflowTaskPlanError("task claim must be an object");
  }
  if (value.executionId !== plan.executionId || value.planId !== plan.planId) {
    throw new WorkflowTaskPlanError("task claim execution or plan identity is not canonical");
  }
  if (typeof value.taskId !== "string") {
    throw new WorkflowTaskPlanError("task claim task identity is not canonical");
  }
  const task = plan.tasks.find((candidate) => candidate.taskId === value.taskId);
  if (task === undefined) {
    throw new WorkflowTaskPlanError("task claim names a task outside the admitted plan");
  }
  if (typeof value.claimId !== "string" || !CLAIM_ID_PATTERN.test(value.claimId)) {
    throw new WorkflowTaskPlanError("task claim identity is not canonical");
  }
  if (!Number.isSafeInteger(value.attempt) || (value.attempt as number) < 1) {
    throw new WorkflowTaskPlanError("task claim attempt is not canonical");
  }
  if (value.effect !== task.effect) {
    throw new WorkflowTaskPlanError("task claim effect does not match the admitted task");
  }
  return {
    executionId: plan.executionId,
    planId: plan.planId,
    taskId: task.taskId,
    claimId: value.claimId,
    attempt: value.attempt as number,
    effect: task.effect,
  };
}

function validatedCheckpoint(value: unknown): ExecutionCheckpoint {
  return admitExecutionCheckpoint(value as ExecutionCheckpoint, value as ExecutionCheckpoint).checkpoint;
}

function validatedInitialCheckpoint(value: unknown): ExecutionCheckpoint {
  return admitExecutionCheckpoint(null, value as ExecutionCheckpoint).checkpoint;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Derives the privacy-preserving deterministic Durable Object name for one canonical execution.
 * Every plan revision and scheduler caller for the same execution therefore reaches one Cloudflare
 * single-authority object, while the raw execution identity is not exposed in the object name.
 */
export async function workflowStateObjectName(executionId: unknown): Promise<string> {
  if (!isCanonicalExecutionId(executionId)) {
    throw new WorkflowTaskPlanError("workflow state routing execution identity is not canonical");
  }
  return `workflow:${await sha256Hex(executionId)}`;
}

/**
 * Routes a validated workflow-state command to the one Durable Object selected by execution identity.
 * The Durable Object independently re-admits the plan and checkpoint/claim evidence before granting
 * any mutation authority, so caller-side validation cannot replace the state owner's checks.
 */
export async function routeWorkflowStateCommand(
  env: WorkflowStateDurableObjectEnv,
  command: WorkflowStateCommand,
): Promise<Response> {
  const admittedPlan = admitWorkflowTaskPlan(command.plan);
  const objectName = await workflowStateObjectName(admittedPlan.executionId);
  const objectId = env.NOEMA_WORKFLOW_STATE.idFromName(objectName);
  const stub = env.NOEMA_WORKFLOW_STATE.get(objectId);
  return stub.fetch(WORKFLOW_STATE_INTERNAL_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...command, plan: admittedPlan }),
  });
}

/**
 * Cloudflare Durable Object adapter that owns one execution's deployed workflow-state serialization point.
 * Domain scheduling remains in the admitted plan and repository; this adapter only binds that authority to
 * Durable Object storage and a private Noema-to-Noema command boundary.
 */
export class NoemaWorkflowState {
  private readonly repository: DurableWorkflowStateRepository;
  private readonly objectName: string | undefined;

  constructor(state: DurableObjectState) {
    this.repository = new DurableWorkflowStateRepository(state.storage);
    this.objectName = state.id.name;
  }

  /**
   * Executes one private scheduler command against the durable repository for this object.
   * Wrong endpoints, non-JSON input, malformed plans/checkpoints/command fields, stale claims, and storage
   * failures fail closed without exposing secrets or foreign domain payloads.
   */
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST" || request.url !== WORKFLOW_STATE_INTERNAL_ENDPOINT) {
      return jsonResponse({ ok: false, error: "invalid_request" }, 404);
    }
    if (!isJsonMediaType(request.headers.get("content-type"))) {
      return jsonResponse({ ok: false, error: "invalid_request" }, 415);
    }

    let rawCommand: unknown;
    try {
      rawCommand = await request.json();
    } catch {
      return jsonResponse({ ok: false, error: "invalid_request" }, 400);
    }
    if (
      !isRecord(rawCommand)
      || typeof rawCommand.operation !== "string"
      || !workflowStateOperations.has(rawCommand.operation as WorkflowStateCommand["operation"])
    ) {
      return jsonResponse({ ok: false, error: "invalid_request" }, 400);
    }

    try {
      const plan = admitWorkflowTaskPlan(rawCommand.plan as WorkflowTaskPlan);
      const expectedObjectName = await workflowStateObjectName(plan.executionId);
      if (this.objectName !== expectedObjectName) {
        throw new WorkflowStateConflictError(
          "workflow state command does not match this Durable Object execution authority",
        );
      }
      let data: WorkflowExecutionStateSnapshot | WorkflowTaskClaim;
      switch (rawCommand.operation as WorkflowStateCommand["operation"]) {
        case "initialize":
          data = await this.repository.initialize(plan, validatedInitialCheckpoint(rawCommand.checkpoint));
          break;
        case "read":
          data = await this.repository.readState(plan);
          break;
        case "claim_next":
          data = await this.repository.claimNextRunnableTask(
            plan,
            commandIdentity(rawCommand.claimId, "claim"),
          );
          break;
        case "claim_runnable":
          data = await this.repository.claimRunnableTask(
            plan,
            commandTaskId(rawCommand.taskId),
            commandIdentity(rawCommand.claimId, "claim"),
          );
          break;
        case "mark_effect_started":
          data = await this.repository.markEffectStarted(plan, workflowTaskClaim(rawCommand.claim, plan));
          break;
        case "request_cancellation":
          data = await this.repository.requestCancellation(
            plan,
            commandIdentity(rawCommand.cancellationId, "cancellation"),
          );
          break;
        case "complete":
          data = await this.repository.completeTask(
            plan,
            workflowTaskClaim(rawCommand.claim, plan),
            terminalOutcome(rawCommand.outcome),
          );
          break;
        case "recover_interrupted":
          data = await this.repository.recoverInterruptedTask(plan, workflowTaskClaim(rawCommand.claim, plan));
          break;
        case "resolve_blocked":
          data = await this.repository.resolveBlockedDescendants(plan);
          break;
        case "commit_checkpoint":
          data = await this.repository.commitCheckpoint(
            plan,
            validatedCheckpoint(rawCommand.expected),
            validatedCheckpoint(rawCommand.candidate),
          );
          break;
        /* v8 ignore next -- operation membership is checked immediately before this exhaustive switch. */
        default:
          return jsonResponse({ ok: false, error: "invalid_request" }, 400);
      }
      return jsonResponse({ ok: true, data }, 200);
    } catch (error) {
      if (error instanceof WorkflowTaskPlanError || error instanceof CheckpointAdmissionError) {
        return jsonResponse({ ok: false, error: "invalid_request" }, 400);
      }
      if (error instanceof WorkflowStateConflictError) {
        return jsonResponse({ ok: false, error: "conflict" }, 409);
      }
      if (error instanceof WorkflowStateStoreUnavailableError) {
        return jsonResponse({ ok: false, error: "storage_unavailable" }, 503);
      }
      /* v8 ignore next -- repository/admission boundaries normalize their documented failures above. */
      return jsonResponse({ ok: false, error: "internal_error" }, 500);
    }
  }
}