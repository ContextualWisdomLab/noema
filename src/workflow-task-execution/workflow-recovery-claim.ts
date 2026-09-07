import type { AdmittedWorkflowTaskPlan } from "./task-plan";
import {
  WorkflowStateConflictError,
  type WorkflowExecutionStateSnapshot,
  type WorkflowTaskClaim,
} from "./workflow-state-store";

/**
 * Reconstructs the exact durable claim authority for one actively running task from an admitted
 * plan and a freshly read state snapshot alone, without minting a replacement claim identity.
 *
 * A `WorkflowTaskClaim` returned by `claimRunnableTask`/`claimNextRunnableTask` is an in-memory
 * capability, not durable state on its own; it does not survive a crash or restart of the process
 * that received it. This is the restart recovery seam ADR-0013 requires: a restarted process reads
 * the durable state snapshot, then reconstructs the identical claim identity, attempt, and effect
 * classification the prior process already recorded, so it can call `completeTask` or
 * `recoverInterruptedTask` for a possibly-started side effect using real durable evidence instead
 * of fabricating new claim authority for work it never itself claimed.
 *
 * @param plan Admitted workflow task plan that defines the task's effect classification.
 * @param snapshot Current durable state snapshot obtained from `DurableWorkflowStateRepository.readState`.
 * @param taskId Task to reconstruct durable claim authority for.
 * @returns The exact `WorkflowTaskClaim` already retained as durable authority for this task.
 * @throws {WorkflowStateConflictError} When the snapshot belongs to another execution or plan, the
 *   task is unknown to the admitted plan, or the task has no durable active claim to reconstruct.
 */
export function reconstructActiveTaskClaim(
  plan: AdmittedWorkflowTaskPlan,
  snapshot: WorkflowExecutionStateSnapshot,
  taskId: string,
): WorkflowTaskClaim {
  if (snapshot.executionId !== plan.executionId || snapshot.planId !== plan.planId) {
    throw new WorkflowStateConflictError("state snapshot belongs to another execution or plan");
  }
  const definition = plan.tasks.find((task) => task.taskId === taskId);
  if (!definition) {
    throw new WorkflowStateConflictError("task does not belong to the admitted plan");
  }
  const stored = snapshot.tasks.find((task) => task.taskId === taskId);
  if (!stored || stored.state !== "running" || stored.activeClaimId === null) {
    throw new WorkflowStateConflictError("task has no durable active claim authority to reconstruct");
  }
  return Object.freeze({
    executionId: snapshot.executionId,
    planId: snapshot.planId,
    taskId: stored.taskId,
    claimId: stored.activeClaimId,
    attempt: stored.attempt,
    effect: definition.effect,
  });
}
