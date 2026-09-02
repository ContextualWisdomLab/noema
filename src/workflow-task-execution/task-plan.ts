import { isCanonicalExecutionId } from "../runtime-shared/execution-identity";

/** Maximum number of tasks accepted in one bounded Noema workflow plan. */
export const MAX_WORKFLOW_TASKS = 256;

/** Maximum dependency fan-in accepted for one workflow task. */
export const MAX_TASK_DEPENDENCIES = 64;

/** Maximum concurrently running tasks admitted by one workflow plan. */
export const MAX_WORKFLOW_CONCURRENCY = 64;

const TASK_ID_PATTERN = /^[\x21-\x7e]{1,128}$/u;

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
  maxConcurrency: number;
  readonly tasks: readonly WorkflowTaskDefinition[];
}

/** Current retained state supplied for exactly one task in an admitted plan. */
export interface WorkflowTaskStateSnapshot {
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

function reject(message: string): never {
  throw new WorkflowTaskPlanError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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

/**
 * Validate and detach one bounded workflow dependency graph before it can select runtime work.
 *
 * Task order is retained as deterministic scheduling priority. The plan admits only a canonical
 * execution identity, bounded positive concurrency, unique canonical task identities, explicit
 * side-effect classes, known dependencies, and an acyclic graph. Every nested value is copied and
 * frozen so caller-owned aliases cannot alter execution authority after admission.
 */
export function admitWorkflowTaskPlan(candidate: WorkflowTaskPlan): WorkflowTaskPlan {
  if (!isRecord(candidate)) reject("workflow task plan must be an object");
  if (!isCanonicalExecutionId(candidate.executionId)) reject("execution identity is not canonical");
  if (
    !Number.isSafeInteger(candidate.maxConcurrency) ||
    candidate.maxConcurrency < 1 ||
    candidate.maxConcurrency > MAX_WORKFLOW_CONCURRENCY
  ) {
    reject(`maxConcurrency must be an integer between 1 and ${MAX_WORKFLOW_CONCURRENCY}`);
  }
  if (!Array.isArray(candidate.tasks) || candidate.tasks.length < 1 || candidate.tasks.length > MAX_WORKFLOW_TASKS) {
    reject(`tasks must contain between 1 and ${MAX_WORKFLOW_TASKS} entries`);
  }

  const taskIds = new Set<string>();
  const tasks: WorkflowTaskDefinition[] = [];
  for (const rawTask of candidate.tasks) {
    if (!isRecord(rawTask)) reject("workflow task must be an object");
    const taskId = requireTaskId(rawTask.taskId, "workflow");
    if (taskIds.has(taskId)) reject("duplicate task identity is not permitted");
    taskIds.add(taskId);

    const effect = requireTaskEffect(rawTask.effect);
    if (!Array.isArray(rawTask.dependsOn) || rawTask.dependsOn.length > MAX_TASK_DEPENDENCIES) {
      reject(`task dependencies must contain at most ${MAX_TASK_DEPENDENCIES} entries`);
    }
    const dependencies: string[] = [];
    const dependencyIds = new Set<string>();
    for (const rawDependency of rawTask.dependsOn) {
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
    executionId: candidate.executionId,
    maxConcurrency: candidate.maxConcurrency,
    tasks: Object.freeze(tasks),
  });
}

/**
 * Select pending tasks whose complete dependency set is already successful, without manufacturing
 * retry authority or exceeding the admitted concurrency bound.
 *
 * The state vector must contain exactly one canonical entry for every admitted task and no foreign
 * task. Failed or cancelled work remains non-runnable, and a failed/cancelled dependency blocks its
 * descendants. In particular, failed side-effecting tasks are never silently retried by this
 * selector; retry/recovery requires an explicit higher-level decision and execution identity.
 */
export function selectRunnableWorkflowTasks(
  plan: WorkflowTaskPlan,
  currentStates: readonly WorkflowTaskStateSnapshot[],
): readonly string[] {
  const admitted = admitWorkflowTaskPlan(plan);
  if (!Array.isArray(currentStates) || currentStates.length !== admitted.tasks.length) {
    reject("task state evidence must contain exactly one entry for every admitted task");
  }

  const taskIds = new Set(admitted.tasks.map((task) => task.taskId));
  const stateByTask = new Map<string, WorkflowTaskState>();
  for (const rawSnapshot of currentStates) {
    if (!isRecord(rawSnapshot)) reject("task state evidence must be an object");
    const taskId = requireTaskId(rawSnapshot.taskId, "state");
    if (!taskIds.has(taskId)) reject(`foreign task state is not permitted: ${taskId}`);
    if (stateByTask.has(taskId)) reject("duplicate task state is not permitted");
    stateByTask.set(taskId, requireTaskState(rawSnapshot.state));
  }
  if (stateByTask.size !== admitted.tasks.length) {
    reject("task state evidence is incomplete");
  }

  let running = 0;
  for (const state of stateByTask.values()) {
    if (state === "running") running += 1;
  }
  const available = admitted.maxConcurrency - running;
  if (available <= 0) return Object.freeze([]);

  const runnable: string[] = [];
  for (const task of admitted.tasks) {
    if (stateByTask.get(task.taskId) !== "pending") continue;
    if (!task.dependsOn.every((dependency) => stateByTask.get(dependency) === "succeeded")) continue;
    runnable.push(task.taskId);
    if (runnable.length === available) break;
  }
  return Object.freeze(runnable);
}
