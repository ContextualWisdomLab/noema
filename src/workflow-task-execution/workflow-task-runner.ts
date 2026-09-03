import type { AdmittedWorkflowTaskPlan } from "./task-plan";
import type {
  WorkflowExecutionStateSnapshot,
  WorkflowTaskClaim,
  WorkflowTaskTerminalOutcome,
} from "./workflow-state-store";

const TERMINAL_OUTCOMES = new Set<WorkflowTaskTerminalOutcome>([
  "succeeded",
  "failed",
  "cancelled",
]);

/**
 * Minimal state authority required by the workflow task runner application service.
 *
 * The port keeps the runner independent from Cloudflare Durable Object storage while requiring the
 * exact operations that establish claim authority, effect-start evidence, and terminal state. A
 * concrete adapter may use Durable Objects or another future storage technology as long as these
 * semantics remain unchanged.
 */
export interface WorkflowTaskExecutionStatePort {
  claimNextRunnableTask(
    plan: AdmittedWorkflowTaskPlan,
    claimId: string,
  ): Promise<WorkflowTaskClaim>;

  markEffectStarted(
    plan: AdmittedWorkflowTaskPlan,
    claim: WorkflowTaskClaim,
  ): Promise<WorkflowExecutionStateSnapshot>;

  completeTask(
    plan: AdmittedWorkflowTaskPlan,
    claim: WorkflowTaskClaim,
    outcome: WorkflowTaskTerminalOutcome,
  ): Promise<WorkflowExecutionStateSnapshot>;
}

/**
 * Effect boundary invoked only after Noema has durably recorded claim and effect-start authority.
 *
 * Implementations may call Tool / Capability, isolation, or other application ports, but provider
 * routing, foreign domain truth, security verdicts, and outbound policy remain in their canonical
 * owners. Throwing means the effect outcome is uncertain; the runner deliberately leaves the exact
 * claim running for explicit recovery or compensation instead of inferring failure or retry safety.
 */
export interface WorkflowTaskEffectPort {
  execute(claim: WorkflowTaskClaim): Promise<WorkflowTaskTerminalOutcome>;
}

/** Exact claim plus durable terminal snapshot returned after one observed effect outcome is committed. */
export interface WorkflowTaskRunResult {
  readonly claim: WorkflowTaskClaim;
  readonly snapshot: WorkflowExecutionStateSnapshot;
}

/** Raised when an effect adapter returns a value outside Noema's terminal task-state vocabulary. */
export class WorkflowTaskEffectOutcomeError extends Error {
  constructor() {
    super("workflow task effect returned a non-canonical terminal outcome");
    this.name = "WorkflowTaskEffectOutcomeError";
  }
}

/** Raised when the state port cannot prove that the exact claim durably crossed the effect boundary. */
export class WorkflowTaskEffectAuthorityError extends Error {
  constructor() {
    super("workflow task effect-start authority is missing or does not match the exact active claim");
    this.name = "WorkflowTaskEffectAuthorityError";
  }
}

function requireEffectStartAuthority(
  plan: AdmittedWorkflowTaskPlan,
  claim: WorkflowTaskClaim,
  snapshot: WorkflowExecutionStateSnapshot,
): void {
  if (snapshot.executionId !== plan.executionId || snapshot.planId !== plan.planId) {
    throw new WorkflowTaskEffectAuthorityError();
  }
  const retained = snapshot.tasks.find((task) => task.taskId === claim.taskId);
  if (
    retained === undefined
    || retained.state !== "running"
    || retained.activeClaimId !== claim.claimId
    || retained.attempt !== claim.attempt
    || retained.effectStarted !== true
  ) {
    throw new WorkflowTaskEffectAuthorityError();
  }
}

/**
 * Executes at most one runnable task while preserving durable authority ordering.
 *
 * The application sequence is strict: atomic claim → durable effect-start marker → effect invocation
 * → durable terminal outcome. If claiming or effect-start persistence fails, or if the state adapter
 * returns evidence that does not prove the exact active claim crossed effect start, the effect port is
 * never invoked. If the effect throws or returns a malformed outcome, no terminal transition is
 * fabricated; the claim remains running so recovery can apply the task's effect-specific policy. This
 * service does not retry, select providers, infer security/business truth, or execute compensation on
 * its own.
 *
 * @param plan Exact detached workflow plan previously admitted by Noema.
 * @param claimId Canonical caller-generated identity for this execution attempt.
 * @param statePort Durable state authority implementing claim/effect-start/completion semantics.
 * @param effectPort Application effect adapter invoked under the exact durable claim.
 * @returns The exact claim and terminal durable state after a canonical observed outcome is committed.
 */
export async function executeNextWorkflowTask(
  plan: AdmittedWorkflowTaskPlan,
  claimId: string,
  statePort: WorkflowTaskExecutionStatePort,
  effectPort: WorkflowTaskEffectPort,
): Promise<WorkflowTaskRunResult> {
  const claim = await statePort.claimNextRunnableTask(plan, claimId);
  const effectStartSnapshot = await statePort.markEffectStarted(plan, claim);
  requireEffectStartAuthority(plan, claim, effectStartSnapshot);
  const outcome = await effectPort.execute(claim);
  if (!TERMINAL_OUTCOMES.has(outcome)) {
    throw new WorkflowTaskEffectOutcomeError();
  }
  const snapshot = await statePort.completeTask(plan, claim, outcome);
  return Object.freeze({ claim, snapshot });
}