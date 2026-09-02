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
const CANCELLATION_ID_PATTERN = CLAIM_ID_PATTERN;
const STATE_DIGEST_PATTERN = /^[a-f0-9]{64}$/u;
const TERMINAL_OUTCOMES = new Set<WorkflowTaskTerminalOutcome>([
  "succeeded",
  "failed",
  "cancelled",
]);
const STORED_TASK_STATES = new Set<WorkflowRepositoryTaskState>([
  "pending",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "blocked",
]);
const TRANSITION_TYPES = new Set<WorkflowTransitionType>([
  "initialized",
  "task_claimed",
  "effect_started",
  "task_completed",
  "task_recovered",
  "task_blocked",
  "cancellation_requested",
  "task_cancelled",
  "checkpoint_committed",
]);

/** Maximum automatic recovery attempts for pure/idempotent work. */
export const MAX_AUTOMATIC_RECOVERY_ATTEMPTS = 3;

/**
 * Maximum retained transition receipts per workflow execution.
 *
 * The monotonic transition sequence continues after old receipts are dropped, so operators can detect
 * truncation without retaining an unbounded event log inside the Durable Object record.
 */
export const MAX_TRANSITION_RECEIPTS = 128;

/** Versioned deterministic scheduling/recovery policy retained with each durable execution record. */
export const WORKFLOW_EXECUTION_POLICY_V1 = Object.freeze({
  policyVersion: "workflow-execution-policy.v1" as const,
  schedulingPolicy: "admission_order" as const,
  maxAutomaticRecoveryAttempts: MAX_AUTOMATIC_RECOVERY_ATTEMPTS,
});

/** Exact versioned workflow execution policy retained as durable scheduling authority. */
export type WorkflowExecutionPolicy = typeof WORKFLOW_EXECUTION_POLICY_V1;

/** Terminal result that an active task claim may record exactly once. */
export type WorkflowTaskTerminalOutcome = "succeeded" | "failed" | "cancelled";

/** Durable task state, including repository-owned blocked-descendant recovery evidence. */
export type WorkflowRepositoryTaskState = WorkflowTaskState | "blocked";

/** Bounded causal transition classes retained by the state-store boundary. */
export type WorkflowTransitionType =
  | "initialized"
  | "task_claimed"
  | "effect_started"
  | "task_completed"
  | "task_recovered"
  | "task_blocked"
  | "cancellation_requested"
  | "task_cancelled"
  | "checkpoint_committed";

/** Durable execution-level cancellation authority; the first canonical cancellation identity wins. */
export interface WorkflowCancellationState {
  readonly requested: boolean;
  readonly cancellationId: string | null;
}

/** Immutable reservation returned only after one pending task becomes durably owned by a claim. */
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
  readonly state: WorkflowRepositoryTaskState;
  readonly attempt: number;
  readonly activeClaimId: string | null;
  readonly effectStarted: boolean | null;
}

/**
 * Payload-minimized causal receipt retained by the workflow state store.
 *
 * The receipt deliberately contains only Noema execution authority identities and state transitions.
 * It never stores prompts, tool payloads, provider credentials, foreign domain values, or security verdicts.
 */
export interface WorkflowTransitionReceipt {
  readonly transitionSequence: number;
  readonly transitionType: WorkflowTransitionType;
  readonly taskId: string | null;
  readonly claimId: string | null;
  readonly attempt: number | null;
  readonly cancellationId: string | null;
  readonly resultingState: WorkflowRepositoryTaskState | null;
  readonly checkpointSequence: number;
  readonly checkpointStateDigest: string;
}

/** Immutable state/checkpoint/provenance snapshot for one exact workflow execution and plan revision. */
export interface WorkflowExecutionStateSnapshot {
  readonly executionId: string;
  readonly planId: string;
  readonly policy: WorkflowExecutionPolicy;
  readonly cancellation: WorkflowCancellationState;
  readonly checkpoint: ExecutionCheckpoint;
  readonly tasks: readonly WorkflowTaskStoredState[];
  readonly transitionSequence: number;
  readonly transitionReceipts: readonly WorkflowTransitionReceipt[];
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
  state: WorkflowRepositoryTaskState;
  attempt: number;
  activeClaimId: string | null;
  effectStarted?: boolean;
};

type StoredWorkflowState = {
  schemaVersion: 1;
  executionId: string;
  planId: string;
  maxConcurrency: number;
  policy: WorkflowExecutionPolicy;
  cancellation: WorkflowCancellationState;
  tasks: StoredTask[];
  checkpoint: ExecutionCheckpoint;
  transitionSequence?: number;
  transitionReceipts?: WorkflowTransitionReceipt[];
};

type TransactionView = Pick<DurableObjectTransaction, "get" | "put">;

type TransitionDetails = {
  taskId?: string | null;
  claimId?: string | null;
  attempt?: number | null;
  cancellationId?: string | null;
  resultingState?: WorkflowRepositoryTaskState | null;
  checkpoint?: ExecutionCheckpoint;
};

function stateKey(plan: AdmittedWorkflowTaskPlan): string {
  return `workflow-state:v1:${encodeURIComponent(plan.executionId)}:${encodeURIComponent(plan.planId)}`;
}

function requireClaimId(claimId: string): string {
  if (typeof claimId !== "string" || !CLAIM_ID_PATTERN.test(claimId)) {
    throw new WorkflowStateConflictError("claim identity is not canonical");
  }
  return claimId;
}

function requireCancellationId(cancellationId: string): string {
  if (typeof cancellationId !== "string" || !CANCELLATION_ID_PATTERN.test(cancellationId)) {
    throw new WorkflowStateConflictError("cancellation identity is not canonical");
  }
  return cancellationId;
}

function sameCheckpoint(left: ExecutionCheckpoint, right: ExecutionCheckpoint): boolean {
  return left.executionId === right.executionId
    && left.sequence === right.sequence
    && left.stateDigest === right.stateDigest;
}

function selectorState(state: WorkflowRepositoryTaskState): WorkflowTaskState {
  return state === "blocked" ? "cancelled" : state;
}

function stateVector(record: StoredWorkflowState): WorkflowTaskStateSnapshot[] {
  return record.tasks.map((task) => ({
    executionId: record.executionId,
    planId: record.planId,
    taskId: task.taskId,
    state: selectorState(task.state),
  }));
}

function validateTransitionLedger(record: StoredWorkflowState): void {
  const sequence = record.transitionSequence;
  const receipts = record.transitionReceipts;
  if (sequence === undefined && receipts === undefined) return;
  if (sequence === undefined || receipts === undefined) {
    throw new WorkflowStateConflictError("stored workflow transition ledger is only partially present");
  }
  if (!Number.isSafeInteger(sequence) || sequence < 0 || !Array.isArray(receipts)) {
    throw new WorkflowStateConflictError("stored workflow transition ledger metadata is malformed");
  }
  if (receipts.length > MAX_TRANSITION_RECEIPTS || sequence < receipts.length) {
    throw new WorkflowStateConflictError("stored workflow transition ledger exceeds its bounded contract");
  }

  const firstExpected = sequence - receipts.length + 1;
  for (let index = 0; index < receipts.length; index += 1) {
    const receipt = receipts[index]!;
    if (receipt.transitionSequence !== firstExpected + index || !TRANSITION_TYPES.has(receipt.transitionType)) {
      throw new WorkflowStateConflictError("stored workflow transition receipt sequence or type is malformed");
    }
    if (receipt.taskId !== null && !record.tasks.some((task) => task.taskId === receipt.taskId)) {
      throw new WorkflowStateConflictError("stored workflow transition receipt names an unknown task");
    }
    if (receipt.claimId !== null && !CLAIM_ID_PATTERN.test(receipt.claimId)) {
      throw new WorkflowStateConflictError("stored workflow transition receipt claim identity is malformed");
    }
    if (
      receipt.attempt !== null
      && (!Number.isSafeInteger(receipt.attempt)
        || receipt.attempt < 0
        || receipt.attempt > MAX_AUTOMATIC_RECOVERY_ATTEMPTS)
    ) {
      throw new WorkflowStateConflictError("stored workflow transition receipt attempt is malformed");
    }
    if (receipt.cancellationId !== null && !CANCELLATION_ID_PATTERN.test(receipt.cancellationId)) {
      throw new WorkflowStateConflictError("stored workflow transition receipt cancellation identity is malformed");
    }
    if (receipt.resultingState !== null && !STORED_TASK_STATES.has(receipt.resultingState)) {
      throw new WorkflowStateConflictError("stored workflow transition receipt state is malformed");
    }
    if (
      !Number.isSafeInteger(receipt.checkpointSequence)
      || receipt.checkpointSequence < 0
      || !STATE_DIGEST_PATTERN.test(receipt.checkpointStateDigest)
    ) {
      throw new WorkflowStateConflictError("stored workflow transition receipt checkpoint identity is malformed");
    }
  }
}

function appendTransition(
  record: StoredWorkflowState,
  transitionType: WorkflowTransitionType,
  details: TransitionDetails = {},
): void {
  const checkpoint = details.checkpoint ?? record.checkpoint;
  const nextSequence = (record.transitionSequence ?? 0) + 1;
  const receipt: WorkflowTransitionReceipt = {
    transitionSequence: nextSequence,
    transitionType,
    taskId: details.taskId ?? null,
    claimId: details.claimId ?? null,
    attempt: details.attempt ?? null,
    cancellationId: details.cancellationId ?? null,
    resultingState: details.resultingState ?? null,
    checkpointSequence: checkpoint.sequence,
    checkpointStateDigest: checkpoint.stateDigest,
  };
  const receipts = [...(record.transitionReceipts ?? []), receipt];
  if (receipts.length > MAX_TRANSITION_RECEIPTS) {
    receipts.splice(0, receipts.length - MAX_TRANSITION_RECEIPTS);
  }
  record.transitionSequence = nextSequence;
  record.transitionReceipts = receipts;
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
  if (
    record.policy?.policyVersion !== WORKFLOW_EXECUTION_POLICY_V1.policyVersion
    || record.policy.schedulingPolicy !== WORKFLOW_EXECUTION_POLICY_V1.schedulingPolicy
    || record.policy.maxAutomaticRecoveryAttempts !== MAX_AUTOMATIC_RECOVERY_ATTEMPTS
  ) {
    throw new WorkflowStateConflictError("stored workflow execution policy is not the admitted policy version");
  }
  if (
    typeof record.cancellation?.requested !== "boolean"
    || (record.cancellation.cancellationId !== null
      && (typeof record.cancellation.cancellationId !== "string"
        || !CANCELLATION_ID_PATTERN.test(record.cancellation.cancellationId)))
    || record.cancellation.requested !== (record.cancellation.cancellationId !== null)
  ) {
    throw new WorkflowStateConflictError("stored workflow cancellation authority is malformed");
  }
  if (record.checkpoint.executionId !== record.executionId) {
    throw new WorkflowStateConflictError(
      "stored checkpoint execution identity does not match the workflow execution identity",
    );
  }

  for (let index = 0; index < plan.tasks.length; index += 1) {
    const stored = record.tasks[index]!;
    const expected = plan.tasks[index]!;
    if (stored.taskId !== expected.taskId || stored.effect !== expected.effect) {
      throw new WorkflowStateConflictError("stored workflow task belongs to another admitted plan");
    }
    if (!STORED_TASK_STATES.has(stored.state)) {
      throw new WorkflowStateConflictError("stored workflow task state is not canonical");
    }
    if (
      !Number.isSafeInteger(stored.attempt)
      || stored.attempt < 0
      || stored.attempt > MAX_AUTOMATIC_RECOVERY_ATTEMPTS
    ) {
      throw new WorkflowStateConflictError("stored workflow task attempt is outside the recovery contract");
    }
    if (stored.activeClaimId !== null && !CLAIM_ID_PATTERN.test(stored.activeClaimId)) {
      throw new WorkflowStateConflictError("stored workflow task claim identity is not canonical");
    }
    if (stored.state === "running" && stored.activeClaimId === null) {
      throw new WorkflowStateConflictError("running workflow task is missing its active claim identity");
    }
    if (stored.state !== "running" && stored.activeClaimId !== null) {
      throw new WorkflowStateConflictError("non-running workflow task retains an active claim identity");
    }
    if (stored.effectStarted !== undefined && typeof stored.effectStarted !== "boolean") {
      throw new WorkflowStateConflictError("stored workflow effect-start evidence is malformed");
    }
    if (stored.state === "pending" && stored.effectStarted === true) {
      throw new WorkflowStateConflictError(
        "pending workflow task cannot retain crossed effect-start evidence",
      );
    }
  }

  validateTransitionLedger(record);
  try {
    admitExecutionCheckpoint(record.checkpoint, record.checkpoint);
    selectRunnableWorkflowTasks(plan, stateVector(record));
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown state validation failure";
    throw new WorkflowStateConflictError(`stored workflow state is not admissible: ${message}`);
  }
}

function snapshot(record: StoredWorkflowState): WorkflowExecutionStateSnapshot {
  const checkpoint = Object.freeze({ ...record.checkpoint });
  const policy = Object.freeze({ ...record.policy }) as WorkflowExecutionPolicy;
  const cancellation = Object.freeze({ ...record.cancellation });
  const tasks = Object.freeze(record.tasks.map((task) => Object.freeze({
    taskId: task.taskId,
    state: task.state,
    attempt: task.attempt,
    activeClaimId: task.activeClaimId,
    effectStarted: task.effectStarted ?? null,
  })));
  const transitionReceipts = Object.freeze((record.transitionReceipts ?? []).map((receipt) => Object.freeze({
    ...receipt,
  })));
  return Object.freeze({
    executionId: record.executionId,
    planId: record.planId,
    policy,
    cancellation,
    checkpoint,
    tasks,
    transitionSequence: record.transitionSequence ?? 0,
    transitionReceipts,
  });
}

function snapshotClaim(record: StoredWorkflowState, task: StoredTask): WorkflowTaskClaim {
  return Object.freeze({
    executionId: record.executionId,
    planId: record.planId,
    taskId: task.taskId,
    claimId: task.activeClaimId!,
    attempt: task.attempt,
    effect: task.effect,
  });
}

function requireTask(record: StoredWorkflowState, taskId: string): StoredTask {
  const task = record.tasks.find((candidate) => candidate.taskId === taskId);
  if (!task) throw new WorkflowStateConflictError("task does not belong to the admitted plan");
  return task;
}

function requireMatchingClaim(record: StoredWorkflowState, claim: WorkflowTaskClaim): StoredTask {
  if (claim.executionId !== record.executionId || claim.planId !== record.planId) {
    throw new WorkflowStateConflictError("task claim belongs to another execution or plan");
  }
  if (!CLAIM_ID_PATTERN.test(claim.claimId) || !Number.isSafeInteger(claim.attempt) || claim.attempt < 1) {
    throw new WorkflowStateConflictError("task claim identity or attempt is not canonical");
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

function blockDescendants(record: StoredWorkflowState, plan: AdmittedWorkflowTaskPlan): StoredTask[] {
  const taskById = new Map(record.tasks.map((task) => [task.taskId, task] as const));
  const blockedTasks: StoredTask[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const definition of plan.tasks) {
      const task = taskById.get(definition.taskId)!;
      if (task.state !== "pending") continue;
      const blocked = definition.dependsOn.some((dependencyId) => {
        const dependencyState = taskById.get(dependencyId)!.state;
        return dependencyState === "failed"
          || dependencyState === "cancelled"
          || dependencyState === "blocked";
      });
      if (!blocked) continue;
      task.state = "blocked";
      task.activeClaimId = null;
      task.effectStarted = false;
      blockedTasks.push(task);
      changed = true;
    }
  }
  return blockedTasks;
}

function appendBlockedTransitions(record: StoredWorkflowState, blockedTasks: readonly StoredTask[]): void {
  for (const task of blockedTasks) {
    appendTransition(record, "task_blocked", {
      taskId: task.taskId,
      attempt: task.attempt,
      resultingState: "blocked",
    });
  }
}

function claimTask(
  record: StoredWorkflowState,
  plan: AdmittedWorkflowTaskPlan,
  taskId: string,
  claimId: string,
): WorkflowTaskClaim {
  if (record.cancellation.requested) {
    throw new WorkflowStateConflictError("workflow execution is cancelled; new task claims are forbidden");
  }
  const runnable = selectRunnableWorkflowTasks(plan, stateVector(record));
  if (!runnable.includes(taskId)) {
    throw new WorkflowStateConflictError("task is not runnable under the retained dependency and concurrency state");
  }
  const task = requireTask(record, taskId);
  if (task.state !== "pending" || task.activeClaimId !== null) {
    throw new WorkflowStateConflictError("task is no longer pending and unclaimed");
  }
  if (task.effect === "side_effecting" && task.effectStarted !== false) {
    throw new WorkflowStateConflictError(
      "pending side-effecting task lacks exact unstarted effect-boundary evidence",
    );
  }
  if (task.attempt >= record.policy.maxAutomaticRecoveryAttempts) {
    throw new WorkflowStateConflictError("task attempt counter cannot advance safely");
  }
  task.state = "running";
  task.attempt += 1;
  task.activeClaimId = claimId;
  task.effectStarted = false;
  appendTransition(record, "task_claimed", {
    taskId: task.taskId,
    claimId,
    attempt: task.attempt,
    resultingState: "running",
  });
  return snapshotClaim(record, task);
}

function normalizeStorageError(error: unknown): never {
  if (error instanceof WorkflowStateConflictError) throw error;
  const detail = error instanceof Error ? error.message : "non-Error durable storage failure";
  throw new WorkflowStateStoreUnavailableError(`workflow state storage failed: ${detail}`);
}

/**
 * Durable Object storage adapter for atomic task authority, checkpoint CAS, recovery, and bounded provenance.
 *
 * Runnable selection remains a pure domain decision. This repository owns the durable transition from
 * candidate work to claim authority and records payload-minimized causal receipts in the same transaction.
 */
export class DurableWorkflowStateRepository {
  constructor(private readonly storage: DurableObjectStorage) {}

  /** Initializes state once for an admitted workflow plan and sequence-zero checkpoint. */
  async initialize(
    plan: AdmittedWorkflowTaskPlan,
    initialCheckpoint: ExecutionCheckpoint,
  ): Promise<WorkflowExecutionStateSnapshot> {
    try {
      const admission = admitExecutionCheckpoint(null, initialCheckpoint);
      if (admission.checkpoint.executionId !== plan.executionId) {
        throw new WorkflowStateConflictError("initial checkpoint execution identity does not match workflow plan");
      }
      selectRunnableWorkflowTasks(plan, plan.tasks.map((task) => ({
        executionId: plan.executionId,
        planId: plan.planId,
        taskId: task.taskId,
        state: "pending" as const,
      })));

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
          policy: { ...WORKFLOW_EXECUTION_POLICY_V1 },
          cancellation: { requested: false, cancellationId: null },
          tasks: plan.tasks.map((task) => ({
            taskId: task.taskId,
            effect: task.effect,
            state: "pending",
            attempt: 0,
            activeClaimId: null,
            effectStarted: false,
          })),
          checkpoint: admission.checkpoint,
          transitionSequence: 0,
          transitionReceipts: [],
        };
        appendTransition(record, "initialized");
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

  /** Reads one immutable current state snapshot without granting mutation or execution authority. */
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

  /** Atomically claims the first runnable task selected by the persisted admission-order policy. */
  async claimNextRunnableTask(
    plan: AdmittedWorkflowTaskPlan,
    claimId: string,
  ): Promise<WorkflowTaskClaim> {
    try {
      const canonicalClaimId = requireClaimId(claimId);
      return await this.storage.transaction(async (txn: TransactionView) => {
        const key = stateKey(plan);
        const retained = await txn.get<StoredWorkflowState>(key);
        if (retained === undefined) throw new WorkflowStateConflictError("workflow state has not been initialized");
        assertRecordMatchesPlan(retained, plan);
        if (retained.cancellation.requested) {
          throw new WorkflowStateConflictError("workflow execution is cancelled; new task claims are forbidden");
        }
        const taskId = selectRunnableWorkflowTasks(plan, stateVector(retained))[0];
        if (taskId === undefined) {
          throw new WorkflowStateConflictError("workflow execution has no runnable task under the retained state");
        }
        const claim = claimTask(retained, plan, taskId, canonicalClaimId);
        await txn.put(key, retained);
        return claim;
      });
    } catch (error) {
      return normalizeStorageError(error);
    }
  }

  /** Atomically rechecks dependency/concurrency state and claims one named runnable task. */
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
        const claim = claimTask(retained, plan, taskId, canonicalClaimId);
        await txn.put(key, retained);
        return claim;
      });
    } catch (error) {
      return normalizeStorageError(error);
    }
  }

  /**
   * Marks that an already-authoritative task claim has crossed the effect-start boundary.
   *
   * The operation is idempotent for the exact active claim. It records evidence only; it does not grant
   * retry authority, infer external success, or store the effect payload.
   */
  async markEffectStarted(
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
        if (task.effectStarted === true) return snapshot(retained);
        if (retained.cancellation.requested) {
          throw new WorkflowStateConflictError(
            "workflow execution is cancelled; an unstarted task cannot cross the effect boundary",
          );
        }
        task.effectStarted = true;
        appendTransition(retained, "effect_started", {
          taskId: task.taskId,
          claimId: claim.claimId,
          attempt: task.attempt,
          resultingState: "running",
        });
        await txn.put(key, retained);
        return snapshot(retained);
      });
    } catch (error) {
      return normalizeStorageError(error);
    }
  }

  /**
   * Requests execution cancellation atomically.
   *
   * The first identity wins. Pending tasks become cancelled in the same transaction, while running claims
   * remain intact so their real outcome or compensation can still be recorded.
   */
  async requestCancellation(
    plan: AdmittedWorkflowTaskPlan,
    cancellationId: string,
  ): Promise<WorkflowExecutionStateSnapshot> {
    try {
      const canonicalCancellationId = requireCancellationId(cancellationId);
      return await this.storage.transaction(async (txn: TransactionView) => {
        const key = stateKey(plan);
        const retained = await txn.get<StoredWorkflowState>(key);
        if (retained === undefined) throw new WorkflowStateConflictError("workflow state has not been initialized");
        assertRecordMatchesPlan(retained, plan);
        if (retained.cancellation.requested) {
          if (retained.cancellation.cancellationId !== canonicalCancellationId) {
            throw new WorkflowStateConflictError("workflow cancellation already has different authority");
          }
          return snapshot(retained);
        }
        retained.cancellation = { requested: true, cancellationId: canonicalCancellationId };
        appendTransition(retained, "cancellation_requested", { cancellationId: canonicalCancellationId });
        for (const task of retained.tasks) {
          if (task.state !== "pending") continue;
          task.state = "cancelled";
          task.effectStarted = false;
          appendTransition(retained, "task_cancelled", {
            taskId: task.taskId,
            attempt: task.attempt,
            cancellationId: canonicalCancellationId,
            resultingState: "cancelled",
          });
        }
        await txn.put(key, retained);
        return snapshot(retained);
      });
    } catch (error) {
      return normalizeStorageError(error);
    }
  }

  /**
   * Records one terminal outcome only after the exact active claim has durably crossed effect start.
   *
   * This prevents a direct repository caller from manufacturing completion for work that never reached
   * the effect boundary. An uncertain side effect therefore remains running until explicit reconciliation
   * or compensation observes its real outcome.
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
        if (task.effectStarted !== true) {
          throw new WorkflowStateConflictError("task completion requires durable effect-start evidence");
        }
        task.state = outcome;
        task.activeClaimId = null;
        appendTransition(retained, "task_completed", {
          taskId: task.taskId,
          claimId: claim.claimId,
          attempt: task.attempt,
          resultingState: outcome,
        });
        if (outcome !== "succeeded") {
          appendBlockedTransitions(retained, blockDescendants(retained, plan));
        }
        await txn.put(key, retained);
        return snapshot(retained);
      });
    } catch (error) {
      return normalizeStorageError(error);
    }
  }

  /**
   * Explicitly recovers an interrupted attempt under the retained versioned retry policy.
   * Effect-started or legacy-unknown side-effecting work is never silently replayed. After cancellation,
   * started or legacy-unknown idempotent work also retains its active claim until an explicit outcome or
   * reconciliation records what happened externally; idempotency permits replay, not fabricated cancellation.
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
          if (task.effectStarted === true) {
            throw new WorkflowStateConflictError(
              "effect-started side-effecting task requires an explicit outcome or compensation decision",
            );
          }
          if (task.effectStarted !== false) {
            throw new WorkflowStateConflictError(
              "side-effecting task with unknown effect-start evidence requires explicit reconciliation",
            );
          }
        }
        if (
          retained.cancellation.requested
          && task.effect === "idempotent"
          && task.effectStarted !== false
        ) {
          throw new WorkflowStateConflictError(
            "cancelled idempotent task with started or unknown effect requires explicit reconciliation or outcome",
          );
        }
        task.activeClaimId = null;
        let blockedTasks: StoredTask[] = [];
        if (retained.cancellation.requested) {
          task.state = "cancelled";
        } else if (task.attempt >= retained.policy.maxAutomaticRecoveryAttempts) {
          task.state = "failed";
          blockedTasks = blockDescendants(retained, plan);
        } else {
          task.state = "pending";
          task.effectStarted = false;
        }
        appendTransition(retained, "task_recovered", {
          taskId: task.taskId,
          claimId: claim.claimId,
          attempt: task.attempt,
          cancellationId: retained.cancellation.cancellationId,
          resultingState: task.state,
        });
        appendBlockedTransitions(retained, blockedTasks);
        await txn.put(key, retained);
        return snapshot(retained);
      });
    } catch (error) {
      return normalizeStorageError(error);
    }
  }

  /** Recomputes terminal blocked descendants without disturbing unrelated runnable work. */
  async resolveBlockedDescendants(
    plan: AdmittedWorkflowTaskPlan,
  ): Promise<WorkflowExecutionStateSnapshot> {
    try {
      return await this.storage.transaction(async (txn: TransactionView) => {
        const key = stateKey(plan);
        const retained = await txn.get<StoredWorkflowState>(key);
        if (retained === undefined) throw new WorkflowStateConflictError("workflow state has not been initialized");
        assertRecordMatchesPlan(retained, plan);
        appendBlockedTransitions(retained, blockDescendants(retained, plan));
        await txn.put(key, retained);
        return snapshot(retained);
      });
    } catch (error) {
      return normalizeStorageError(error);
    }
  }

  /**
   * Commits the next checkpoint only if the retained checkpoint still matches caller evidence exactly.
   * Divergent successors from one retained checkpoint cannot both become durable authority.
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
        appendTransition(retained, "checkpoint_committed", { checkpoint: admission.checkpoint });
        await txn.put(key, retained);
        return snapshot(retained);
      });
    } catch (error) {
      return normalizeStorageError(error);
    }
  }
}
