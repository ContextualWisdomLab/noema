import {
  CheckpointAdmissionError,
  admitExecutionCheckpoint,
  type ExecutionCheckpoint,
} from "../state-checkpoint/checkpoint-admission";
import {
  selectRunnableWorkflowTasks,
  type AdmittedWorkflowTaskPlan,
  type WorkflowTaskEffect,
  type WorkflowTaskState,
  type WorkflowTaskStateSnapshot,
} from "./task-plan";

const STORE_SCHEMA_VERSION = 1;
const CLAIM_ID_PATTERN = /^[\x21-\x7e]{1,128}$/u;
const TERMINAL_OUTCOMES = new Set<WorkflowTaskTerminalOutcome>([
  "succeeded",
  "failed",
  "cancelled",
]);

/** Terminal result that an active task claim may record exactly once. */
export type WorkflowTaskTerminalOutcome = "succeeded" | "failed" | "cancelled";

/**
 * Immutable reservation returned only after the repository atomically changes one pending task to
 * running under the exact admitted execution and plan revision.
 */
export interface WorkflowTaskClaim {
  readonly executionId: string;
  readonly planId: string;
  readonly taskId: string;
  readonly claimId: string;
  readonly attempt: number;
  readonly effect: WorkflowTaskEffect;
}

/** Task state exposed by a repository snapshot without leaking mutable storage records. */
export interface WorkflowTaskStoredState {
  readonly taskId: string;
  readonly state: WorkflowTaskState;
  readonly attempt: number;
  readonly activeClaimId: string | null;
}

/** Immutable state/checkpoint snapshot for one exact workflow execution and plan revision. */
export interface WorkflowExecutionStateSnapshot {
  readonly executionId: string;
  readonly planId: string;
  readonly checkpoint: ExecutionCheckpoint;
  readonly tasks: readonly WorkflowTaskStoredState[];
}

/** Raised when stale authority, an invalid transition, or a competing writer loses an atomic claim/CAS. */
export class WorkflowStateConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowStateConflictError";
  }
}

/** Raised when durable storage itself cannot provide trustworthy state evidence. */
export class WorkflowStateStoreUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowStateStoreUnavailableError";
  }
}

type StoredTask = {
  taskId: string;
  effect: WorkflowTaskEffect;
  state: WorkflowTaskState;
  attempt: number;
  activeClaimId: string | null;
};

type StoredWorkflowState = {
  schemaVersion: 1;
  executionId: string;
  planId: string;
  maxConcurrency: number;
  tasks: StoredTask[];
  checkpoint: ExecutionCheckpoint;
};

type TransactionView = Pick<DurableObjectTransaction, "get" | "put">;

function stateKey(plan: AdmittedWorkflowTaskPlan): string {
  return `workflow-state:v1:${encodeURIComponent(plan.executionId)}:${encodeURIComponent(plan.planId)}`;
}

function requireClaimId(claimId: string): string {
  if (typeof claimId !== "string" || !CLAIM_ID_PATTERN.test(claimId)) {
    throw new WorkflowStateConflictError("claim identity is not canonical");
  }
  return claimId;
}

function sameCheckpoint(left: ExecutionCheckpoint, right: ExecutionCheckpoint): boolean {
  return left.executionId === right.executionId
    && left.sequence === right.sequence
    && left.stateDigest === right.stateDigest;
}

function stateVector(record: StoredWorkflowState): WorkflowTaskStateSnapshot[] {
  return record.tasks.map((task) => ({
    executionId: record.executionId,
    planId: record.planId,
    taskId: task.taskId,
    state: task.state,
  }));
}

function assertRecordMatchesPlan(record: StoredWorkflowState, plan: AdmittedWorkflowTaskPlan): void {
  if (
    record.schemaVersion !== STORE_SCHEMA_VERSION
    || record.executionId !== plan.executionId
    || record.planId !== plan.planId
    || record.maxConcurrency !== plan.maxConcurrency
    || record.tasks.length !== plan.tasks.length
  ) {
    throw new WorkflowStateConflictError("stored workflow state does not match the admitted plan revision");
  }

  for (let index = 0; index < plan.tasks.length; index += 1) {
    const stored = record.tasks[index];
    const expected = plan.tasks[index];
    if (
      stored?.taskId !== expected?.taskId
      || stored.effect !== expected.effect
      || !Number.isSafeInteger(stored.attempt)
      || stored.attempt < 0
      || (stored.activeClaimId !== null && !CLAIM_ID_PATTERN.test(stored.activeClaimId))
    ) {
      throw new WorkflowStateConflictError("stored workflow task evidence is malformed or belongs to another plan");
    }
    if (stored.state === "running" && stored.activeClaimId === null) {
      throw new WorkflowStateConflictError("running workflow task is missing its active claim identity");
    }
    if (stored.state !== "running" && stored.activeClaimId !== null) {
      throw new WorkflowStateConflictError("non-running workflow task retains an active claim identity");
    }
  }

  try {
    admitExecutionCheckpoint(record.checkpoint, record.checkpoint);
    selectRunnableWorkflowTasks(plan, stateVector(record));
  } catch (error) {
    throw new WorkflowStateConflictError(
      error instanceof Error ? `stored workflow state is not admissible: ${error.message}` : "stored workflow state is not admissible",
    );
  }
}

function snapshot(record: StoredWorkflowState): WorkflowExecutionStateSnapshot {
  const checkpoint = Object.freeze({ ...record.checkpoint });
  const tasks = Object.freeze(record.tasks.map((task) => Object.freeze({
    taskId: task.taskId,
    state: task.state,
    attempt: task.attempt,
    activeClaimId: task.activeClaimId,
  })));
  return Object.freeze({
    executionId: record.executionId,
    planId: record.planId,
    checkpoint,
    tasks,
  });
}

function snapshotClaim(record: StoredWorkflowState, task: StoredTask): WorkflowTaskClaim {
  if (task.activeClaimId === null) {
    throw new WorkflowStateConflictError("claimed task lost its active claim identity");
  }
  return Object.freeze({
    executionId: record.executionId,
    planId: record.planId,
    taskId: task.taskId,
    claimId: task.activeClaimId,
    attempt: task.attempt,
    effect: task.effect,
  });
}

function requireTask(record: StoredWorkflowState, taskId: string): StoredTask {
  const task = record.tasks.find((candidate) => candidate.taskId === taskId);
  if (!task) throw new WorkflowStateConflictError("task does not belong to the admitted plan");
  return task;
}

function requireMatchingClaim(
  record: StoredWorkflowState,
  claim: WorkflowTaskClaim,
): StoredTask {
  if (
    claim.executionId !== record.executionId
    || claim.planId !== record.planId
    || !CLAIM_ID_PATTERN.test(claim.claimId)
    || !Number.isSafeInteger(claim.attempt)
    || claim.attempt < 1
  ) {
    throw new WorkflowStateConflictError("task claim does not belong to the retained execution and plan");
  }
  const task = requireTask(record, claim.taskId);
  if (
    task.state !== "running"
    || task.activeClaimId !== claim.claimId
    || task.attempt !== claim.attempt
    || task.effect !== claim.effect
  ) {
    throw new WorkflowStateConflictError("task claim is stale or no longer owns the running task");
  }
  return task;
}

function normalizeStorageError(error: unknown): never {
  if (error instanceof WorkflowStateConflictError) throw error;
  throw new WorkflowStateStoreUnavailableError(
    error instanceof Error ? `workflow state storage failed: ${error.message}` : "workflow state storage failed",
  );
}

/**
 * Durable Object storage adapter that makes workflow task reservation and checkpoint history atomic.
 *
 * The adapter intentionally accepts only an `AdmittedWorkflowTaskPlan`; runnable selection remains the
 * domain authority for dependency/concurrency policy, while this repository owns the durable transition
 * from candidate to claimed work. Every mutation executes inside one Durable Object storage transaction.
 * A caller must therefore obtain a successful `WorkflowTaskClaim` before starting an effect. Interrupted
 * pure/idempotent work may be explicitly requeued; side-effecting work remains running until a separate
 * operator/recovery decision records its real outcome, preventing silent duplicate side effects.
 *
 * The adapter does not discover models/providers, security verdicts, or foreign domain truth. Its durable
 * record is scoped only to Noema workflow state and checkpoint authority.
 */
export class DurableWorkflowStateRepository {
  constructor(private readonly storage: DurableObjectStorage) {}

  /**
   * Initializes durable state once for an admitted workflow plan.
   * @param plan Exact detached plan returned by `admitWorkflowTaskPlan`.
   * @param initialCheckpoint Sequence-zero checkpoint for the same execution identity.
   * @returns Frozen durable snapshot; repeated identical initialization is idempotent.
   */
  async initialize(
    plan: AdmittedWorkflowTaskPlan,
    initialCheckpoint: ExecutionCheckpoint,
  ): Promise<WorkflowExecutionStateSnapshot> {
    try {
      const admission = admitExecutionCheckpoint(null, initialCheckpoint);
      if (admission.checkpoint.executionId !== plan.executionId) {
        throw new WorkflowStateConflictError("initial checkpoint execution identity does not match workflow plan");
      }
      // Also proves this exact object carries module-local admitted-plan authority before persistence.
      const pendingVector = plan.tasks.map((task) => ({
        executionId: plan.executionId,
        planId: plan.planId,
        taskId: task.taskId,
        state: "pending" as const,
      }));
      selectRunnableWorkflowTasks(plan, pendingVector);

      return await this.storage.transaction(async (txn) => {
        const key = stateKey(plan);
        const retained = await txn.get<StoredWorkflowState>(key);
        if (retained !== undefined) {
          assertRecordMatchesPlan(retained, plan);
          if (!sameCheckpoint(retained.checkpoint, admission.checkpoint)) {
            throw new WorkflowStateConflictError("workflow state was already initialized with different checkpoint authority");
          }
          return snapshot(retained);
        }

        const record: StoredWorkflowState = {
          schemaVersion: STORE_SCHEMA_VERSION,
          executionId: plan.executionId,
          planId: plan.planId,
          maxConcurrency: plan.maxConcurrency,
          tasks: plan.tasks.map((task) => ({
            taskId: task.taskId,
            effect: task.effect,
            state: "pending",
            attempt: 0,
            activeClaimId: null,
          })),
          checkpoint: admission.checkpoint,
        };
        await txn.put(key, record);
        return snapshot(record);
      });
    } catch (error) {
      if (error instanceof CheckpointAdmissionError) {
        throw new WorkflowStateConflictError(`initial checkpoint is not admissible: ${error.message}`);
      }
      return normalizeStorageError(error);
    }
  }

  /** Read one immutable current state snapshot without granting mutation or execution authority. */
  async readState(plan: AdmittedWorkflowTaskPlan): Promise<WorkflowExecutionStateSnapshot> {
    try {
      const retained = await this.storage.get<StoredWorkflowState>(stateKey(plan));
      if (retained === undefined) throw new WorkflowStateConflictError("workflow state has not been initialized");
      assertRecordMatchesPlan(retained, plan);
      return snapshot(retained);
    } catch (error) {
      return normalizeStorageError(error);
    }
  }

  /**
   * Atomically rechecks dependency/concurrency state and claims one declaration-order runnable task.
   * A successful return is the only authority this repository grants to start that task attempt.
   */
  async claimRunnableTask(
    plan: AdmittedWorkflowTaskPlan,
    taskId: string,
    claimId: string,
  ): Promise<WorkflowTaskClaim> {
    try {
      const canonicalClaimId = requireClaimId(claimId);
      return await this.storage.transaction(async (txn: TransactionView) => {
        const key = stateKey(plan);
        const retained = await txn.get<StoredWorkflowState>(key);
        if (retained === undefined) throw new WorkflowStateConflictError("workflow state has not been initialized");
        assertRecordMatchesPlan(retained, plan);

        const runnable = selectRunnableWorkflowTasks(plan, stateVector(retained));
        if (!runnable.includes(taskId)) {
          throw new WorkflowStateConflictError("task is not runnable under the retained dependency and concurrency state");
        }
        const task = requireTask(retained, taskId);
        if (task.state !== "pending" || task.activeClaimId !== null) {
          throw new WorkflowStateConflictError("task is no longer pending and unclaimed");
        }
        if (task.attempt >= Number.MAX_SAFE_INTEGER) {
          throw new WorkflowStateConflictError("task attempt counter cannot advance safely");
        }
        task.state = "running";
        task.attempt += 1;
        task.activeClaimId = canonicalClaimId;
        await txn.put(key, retained);
        return snapshotClaim(retained, task);
      });
    } catch (error) {
      return normalizeStorageError(error);
    }
  }

  /**
   * Records one terminal task outcome only while the exact active claim still owns that attempt.
   * Duplicate or stale completion cannot overwrite a newer recovery/claim decision.
   */
  async completeTask(
    plan: AdmittedWorkflowTaskPlan,
    claim: WorkflowTaskClaim,
    outcome: WorkflowTaskTerminalOutcome,
  ): Promise<WorkflowExecutionStateSnapshot> {
    try {
      if (!TERMINAL_OUTCOMES.has(outcome)) {
        throw new WorkflowStateConflictError("task terminal outcome is not canonical");
      }
      return await this.storage.transaction(async (txn: TransactionView) => {
        const key = stateKey(plan);
        const retained = await txn.get<StoredWorkflowState>(key);
        if (retained === undefined) throw new WorkflowStateConflictError("workflow state has not been initialized");
        assertRecordMatchesPlan(retained, plan);
        const task = requireMatchingClaim(retained, claim);
        task.state = outcome;
        task.activeClaimId = null;
        await txn.put(key, retained);
        return snapshot(retained);
      });
    } catch (error) {
      return normalizeStorageError(error);
    }
  }

  /**
   * Explicitly recovers an interrupted attempt. Pure/idempotent work returns to pending; an interrupted
   * side effect is never replayed automatically because its external effect may already have occurred.
   */
  async recoverInterruptedTask(
    plan: AdmittedWorkflowTaskPlan,
    claim: WorkflowTaskClaim,
  ): Promise<WorkflowExecutionStateSnapshot> {
    try {
      return await this.storage.transaction(async (txn: TransactionView) => {
        const key = stateKey(plan);
        const retained = await txn.get<StoredWorkflowState>(key);
        if (retained === undefined) throw new WorkflowStateConflictError("workflow state has not been initialized");
        assertRecordMatchesPlan(retained, plan);
        const task = requireMatchingClaim(retained, claim);
        if (task.effect === "side_effecting") {
          throw new WorkflowStateConflictError(
            "side-effecting interrupted task requires an explicit outcome or compensation decision",
          );
        }
        task.state = "pending";
        task.activeClaimId = null;
        await txn.put(key, retained);
        return snapshot(retained);
      });
    } catch (error) {
      return normalizeStorageError(error);
    }
  }

  /**
   * Commits the next checkpoint only if the retained checkpoint still exactly matches caller evidence.
   * The compare-and-swap and checkpoint admission happen in one transaction, so two divergent successors
   * derived from one retained checkpoint cannot both become durable authority.
   */
  async commitCheckpoint(
    plan: AdmittedWorkflowTaskPlan,
    expected: ExecutionCheckpoint,
    candidate: ExecutionCheckpoint,
  ): Promise<WorkflowExecutionStateSnapshot> {
    try {
      return await this.storage.transaction(async (txn: TransactionView) => {
        const key = stateKey(plan);
        const retained = await txn.get<StoredWorkflowState>(key);
        if (retained === undefined) throw new WorkflowStateConflictError("workflow state has not been initialized");
        assertRecordMatchesPlan(retained, plan);
        if (!sameCheckpoint(retained.checkpoint, expected)) {
          throw new WorkflowStateConflictError("checkpoint compare-and-swap lost to a newer retained checkpoint");
        }
        let admission;
        try {
          admission = admitExecutionCheckpoint(retained.checkpoint, candidate);
        } catch (error) {
          if (error instanceof CheckpointAdmissionError) {
            throw new WorkflowStateConflictError(`checkpoint successor is not admissible: ${error.message}`);
          }
          throw error;
        }
        retained.checkpoint = admission.checkpoint;
        await txn.put(key, retained);
        return snapshot(retained);
      });
    } catch (error) {
      return normalizeStorageError(error);
    }
  }
}
