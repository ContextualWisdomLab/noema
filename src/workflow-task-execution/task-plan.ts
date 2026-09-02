import { isCanonicalExecutionId } from "../runtime-shared/execution-identity";

/** Maximum number of tasks accepted in one bounded Noema workflow plan. */
export const MAX_WORKFLOW_TASKS = 256;

/** Maximum dependency fan-in accepted for one workflow task. */
export const MAX_TASK_DEPENDENCIES = 64;

/** Maximum concurrently running tasks admitted by one workflow plan. */
export const MAX_WORKFLOW_CONCURRENCY = 64;

const TASK_ID_PATTERN = /^[\x21-\x7e]{1,128}$/u;
const PLAN_ID_PATTERN = /^[\x21-\x7e]{1,128}$/u;

/** Side-effect class used to keep execution policy explicit at the task boundary. */
export type WorkflowTaskEffect = "pure" | "idempotent" | "side_effecting";

/** Retained execution state for one admitted task. */
export type WorkflowTaskState = "pending" | "running" | "succeeded" | "failed" | "cancelled";

/** One task in a bounded dependency graph. */
export interface WorkflowTaskDefinition {
  readonly taskId: string;
  readonly dependsOn: readonly string[];
  readonly effect: WorkflowTaskEffect;
}

/** Untrusted workflow plan accepted at the Workflow / Task Execution boundary. */
export interface WorkflowTaskPlan {
  readonly executionId: string;
  /** Immutable identity for this exact plan revision; a changed graph must use a different planId. */
  readonly planId: string;
  maxConcurrency: number;
  readonly tasks: readonly WorkflowTaskDefinition[];
}

/** Detached immutable plan returned after successful admission. */
export type AdmittedWorkflowTaskPlan = Readonly<WorkflowTaskPlan>;

/** Current retained state supplied for exactly one task in an admitted execution and plan revision. */
export interface WorkflowTaskStateSnapshot {
  readonly executionId: string;
  readonly planId: string;
  readonly taskId: string;
  readonly state: WorkflowTaskState;
}

/** Raised when workflow structure or runtime state cannot safely select executable work. */
export class WorkflowTaskPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowTaskPlanError";
  }
}

const TASK_EFFECTS = new Set<WorkflowTaskEffect>(["pure", "idempotent", "side_effecting"]);
const TASK_STATES = new Set<WorkflowTaskState>([
  "pending",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);
const EXECUTED_TASK_STATES = new Set<WorkflowTaskState>(["running", "succeeded", "failed"]);

function reject(message: string): never {
  throw new WorkflowTaskPlanError(message);
}

function normalizeBoundaryError(error: unknown, message: string): never {
  if (error instanceof WorkflowTaskPlanError) throw error;
  throw new WorkflowTaskPlanError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requirePlanId(value: unknown): string {
  if (typeof value !== "string" || !PLAN_ID_PATTERN.test(value)) {
    return reject("plan identity is not canonical");
  }
  return value;
}

function requireTaskId(value: unknown, label: string): string {
  if (typeof value !== "string" || !TASK_ID_PATTERN.test(value)) {
    return reject(`${label} task identity is not canonical`);
  }
  return value;
}

function requireTaskEffect(value: unknown): WorkflowTaskEffect {
  if (typeof value !== "string" || !TASK_EFFECTS.has(value as WorkflowTaskEffect)) {
    return reject("task effect is not canonical");
  }
  return value as WorkflowTaskEffect;
}

function requireTaskState(value: unknown): WorkflowTaskState {
  if (typeof value !== "string" || !TASK_STATES.has(value as WorkflowTaskState)) {
    return reject("task state is not canonical");
  }
  return value as WorkflowTaskState;
}

function assertAcyclic(tasks: readonly WorkflowTaskDefinition[]): void {
  const dependents = new Map<string, string[]>();
  const remainingDependencies = new Map<string, number>();

  for (const task of tasks) {
    remainingDependencies.set(task.taskId, task.dependsOn.length);
    for (const dependency of task.dependsOn) {
      const current = dependents.get(dependency) ?? [];
      current.push(task.taskId);
      dependents.set(dependency, current);
    }
  }

  const ready: string[] = tasks
    .filter((task) => task.dependsOn.length === 0)
    .map((task) => task.taskId);
  let visited = 0;
  for (let index = 0; index < ready.length; index += 1) {
    const taskId = ready[index];
    visited += 1;
    for (const dependent of dependents.get(taskId) ?? []) {
      const remaining = (remainingDependencies.get(dependent) ?? 0) - 1;
      remainingDependencies.set(dependent, remaining);
      if (remaining === 0) ready.push(dependent);
    }
  }

  if (visited !== tasks.length) reject("workflow task dependency cycle is not permitted");
}

function admitWorkflowTaskPlanBoundary(candidate: WorkflowTaskPlan): AdmittedWorkflowTaskPlan {
  if (!isRecord(candidate)) reject("workflow task plan must be an object");

  const rawExecutionId = candidate.executionId;
  const rawPlanId = candidate.planId;
  const rawMaxConcurrency = candidate.maxConcurrency;
  const rawTasks = candidate.tasks;

  if (!isCanonicalExecutionId(rawExecutionId)) reject("execution identity is not canonical");
  const planId = requirePlanId(rawPlanId);
  if (
    !Number.isSafeInteger(rawMaxConcurrency) ||
    rawMaxConcurrency < 1 ||
    rawMaxConcurrency > MAX_WORKFLOW_CONCURRENCY
  ) {
    reject(`maxConcurrency must be an integer between 1 and ${MAX_WORKFLOW_CONCURRENCY}`);
  }
  if (!Array.isArray(rawTasks)) {
    reject(`tasks must contain between 1 and ${MAX_WORKFLOW_TASKS} entries`);
  }
  const taskCount = rawTasks.length;
  if (taskCount < 1 || taskCount > MAX_WORKFLOW_TASKS) {
    reject(`tasks must contain between 1 and ${MAX_WORKFLOW_TASKS} entries`);
  }

  const taskIds = new Set<string>();
  const tasks: WorkflowTaskDefinition[] = [];
  for (let taskIndex = 0; taskIndex < taskCount; taskIndex += 1) {
    const rawTask = rawTasks[taskIndex];
    if (!isRecord(rawTask)) reject("workflow task must be an object");

    const rawTaskId = rawTask.taskId;
    const rawEffect = rawTask.effect;
    const rawDependsOn = rawTask.dependsOn;

    const taskId = requireTaskId(rawTaskId, "workflow");
    if (taskIds.has(taskId)) reject("duplicate task identity is not permitted");
    taskIds.add(taskId);

    const effect = requireTaskEffect(rawEffect);
    if (!Array.isArray(rawDependsOn)) {
      reject(`task dependencies must contain at most ${MAX_TASK_DEPENDENCIES} entries`);
    }
    const dependencyCount = rawDependsOn.length;
    if (dependencyCount > MAX_TASK_DEPENDENCIES) {
      reject(`task dependencies must contain at most ${MAX_TASK_DEPENDENCIES} entries`);
    }
    const dependencies: string[] = [];
    const dependencyIds = new Set<string>();
    for (let dependencyIndex = 0; dependencyIndex < dependencyCount; dependencyIndex += 1) {
      const rawDependency = rawDependsOn[dependencyIndex];
      const dependency = requireTaskId(rawDependency, "dependency");
      if (dependency === taskId) reject("workflow task cannot depend on itself");
      if (dependencyIds.has(dependency)) reject("duplicate task dependency is not permitted");
      dependencyIds.add(dependency);
      dependencies.push(dependency);
    }
    tasks.push(Object.freeze({ taskId, dependsOn: Object.freeze(dependencies), effect }));
  }

  for (const task of tasks) {
    for (const dependency of task.dependsOn) {
      if (!taskIds.has(dependency)) reject(`unknown dependency: ${dependency}`);
    }
  }
  assertAcyclic(tasks);

  return Object.freeze({
    executionId: rawExecutionId,
    planId,
    maxConcurrency: rawMaxConcurrency,
    tasks: Object.freeze(tasks),
  });
}

/**
 * Validate and detach one bounded workflow dependency graph before it can select runtime work.
 *
 * Authority-bearing top-level and task fields are read exactly once before validation so getters or
 * proxies cannot present one value to validation and another to the admitted snapshot. `planId` binds
 * retained state to this exact plan revision; callers must allocate a different identity whenever the
 * graph, task effects, or execution policy represented by the plan changes. Validated array lengths are
 * captured and traversed by index so custom iterators cannot inject additional or unbounded entries.
 * Every nested value is copied and frozen so caller-owned aliases cannot alter execution authority.
 * Hostile property access is normalized into `WorkflowTaskPlanError` instead of leaking arbitrary
 * accessor exceptions across the application boundary.
 */
export function admitWorkflowTaskPlan(candidate: WorkflowTaskPlan): AdmittedWorkflowTaskPlan {
  try {
    return admitWorkflowTaskPlanBoundary(candidate);
  } catch (error) {
    return normalizeBoundaryError(error, "workflow task plan could not be read safely");
  }
}

function selectRunnableWorkflowTasksBoundary(
  plan: WorkflowTaskPlan,
  currentStates: readonly WorkflowTaskStateSnapshot[],
): readonly string[] {
  const admitted = admitWorkflowTaskPlan(plan);
  if (!Array.isArray(currentStates)) {
    reject("task state evidence must contain exactly one entry for every admitted task");
  }
  const stateCount = currentStates.length;
  if (stateCount !== admitted.tasks.length) {
    reject("task state evidence must contain exactly one entry for every admitted task");
  }

  const taskIds = new Set(admitted.tasks.map((task) => task.taskId));
  const stateByTask = new Map<string, WorkflowTaskState>();
  for (let stateIndex = 0; stateIndex < stateCount; stateIndex += 1) {
    const rawSnapshot = currentStates[stateIndex];
    if (!isRecord(rawSnapshot)) reject("task state evidence must be an object");
    const rawExecutionId = rawSnapshot.executionId;
    const rawPlanId = rawSnapshot.planId;
    const rawTaskId = rawSnapshot.taskId;
    const rawState = rawSnapshot.state;
    if (!isCanonicalExecutionId(rawExecutionId) || rawExecutionId !== admitted.executionId) {
      reject("task state execution identity does not match admitted execution identity");
    }
    const statePlanId = requirePlanId(rawPlanId);
    if (statePlanId !== admitted.planId) {
      reject("task state plan identity does not match admitted plan identity");
    }
    const taskId = requireTaskId(rawTaskId, "state");
    if (!taskIds.has(taskId)) reject(`foreign task state is not permitted: ${taskId}`);
    if (stateByTask.has(taskId)) reject("duplicate task state is not permitted");
    stateByTask.set(taskId, requireTaskState(rawState));
  }
  if (stateByTask.size !== admitted.tasks.length) {
    reject("task state evidence is incomplete");
  }

  let running = 0;
  for (const state of stateByTask.values()) {
    if (state === "running") running += 1;
  }
  if (running > admitted.maxConcurrency) {
    reject("running task state exceeds admitted maxConcurrency");
  }

  for (const task of admitted.tasks) {
    const state = stateByTask.get(task.taskId);
    if (state === undefined || !EXECUTED_TASK_STATES.has(state)) continue;
    for (const dependency of task.dependsOn) {
      if (stateByTask.get(dependency) !== "succeeded") {
        reject("executed task state requires every dependency to be a successful prerequisite");
      }
    }
  }

  const available = admitted.maxConcurrency - running;
  if (available === 0) return Object.freeze([]);

  const runnable: string[] = [];
  for (const task of admitted.tasks) {
    if (stateByTask.get(task.taskId) !== "pending") continue;
    if (!task.dependsOn.every((dependency) => stateByTask.get(dependency) === "succeeded")) continue;
    runnable.push(task.taskId);
    if (runnable.length === available) break;
  }
  return Object.freeze(runnable);
}

/**
 * Select pending tasks whose complete dependency set is already successful, without manufacturing
 * retry authority or exceeding the admitted concurrency bound.
 *
 * The state vector must contain exactly one canonical entry for every admitted task and no foreign
 * task. Each state entry is bound to both the admitted execution and exact plan identity, so a stale
 * state vector from another execution or another revision under the same execution cannot release a
 * side effect. State fields are read exactly once through the validated vector length; custom iterators
 * therefore cannot add unvalidated evidence. A retained vector that already exceeds the concurrency
 * bound is invalid. States proving a task actually executed are rejected if any prerequisite was not
 * successful, preventing a falsely successful intermediate task from releasing descendants. Failed
 * side effects are never silently retried; recovery requires explicit policy.
 *
 * Returned task IDs are scheduling candidates, not execution authority or a reservation. A production
 * scheduler must obtain one atomic state-store snapshot and atomically claim each still-pending task as
 * running under the same execution and plan revision before any side effect starts. This pure selector
 * does not fabricate persistence, compare-and-set semantics, ownership, or duplicate-execution safety.
 */
export function selectRunnableWorkflowTasks(
  plan: WorkflowTaskPlan,
  currentStates: readonly WorkflowTaskStateSnapshot[],
): readonly string[] {
  try {
    return selectRunnableWorkflowTasksBoundary(plan, currentStates);
  } catch (error) {
    return normalizeBoundaryError(error, "workflow task state evidence could not be read safely");
  }
}
