import { describe, expect, it, vi } from "vitest";

import { admitWorkflowTaskPlan } from "../src/workflow-task-execution/task-plan";
import {
  NoemaWorkflowState,
  workflowStateObjectName,
} from "../src/workflow-task-execution/workflow-state-durable-object";
import {
  DurableWorkflowStateRepository,
  WORKFLOW_EXECUTION_POLICY_V1,
  WorkflowStateStoreUnavailableError,
  type WorkflowExecutionStateSnapshot,
  type WorkflowTaskClaim,
} from "../src/workflow-task-execution/workflow-state-store";
import {
  executeNextWorkflowTask,
  WorkflowTaskEffectAuthorityError,
  WorkflowTaskTerminalAuthorityError,
} from "../src/workflow-task-execution/workflow-task-runner";

const digest = (character: string): string => character.repeat(64);

const admittedPlan = () => admitWorkflowTaskPlan({
  executionId: "exec-workflow-coverage-001",
  planId: "plan-workflow-coverage-001",
  maxConcurrency: 1,
  tasks: [{ taskId: "publish", dependsOn: [], effect: "side_effecting" }],
});

const checkpoint = (sequence = 0, character = "a") => ({
  executionId: "exec-workflow-coverage-001",
  sequence,
  stateDigest: digest(character),
});

class TransactionalStorage {
  readonly records = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return structuredClone(this.records.get(key)) as T | undefined;
  }

  async put<T>(key: string, value: T): Promise<void> {
    this.records.set(key, structuredClone(value));
  }

  async list<T>(options: { prefix?: string; limit?: number } = {}): Promise<Map<string, T>> {
    const prefix = options.prefix ?? "";
    const limit = options.limit ?? Number.POSITIVE_INFINITY;
    return new Map(
      [...this.records.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .sort(([left], [right]) => left.localeCompare(right))
        .slice(0, limit)
        .map(([key, value]) => [key, structuredClone(value) as T] as const),
    );
  }

  async transaction<T>(callback: (txn: TransactionalStorage) => Promise<T>): Promise<T> {
    return callback(this);
  }
}

function snapshot(
  claim: WorkflowTaskClaim,
  overrides: Partial<WorkflowExecutionStateSnapshot> = {},
): WorkflowExecutionStateSnapshot {
  return {
    executionId: claim.executionId,
    planId: claim.planId,
    policy: WORKFLOW_EXECUTION_POLICY_V1,
    cancellation: { requested: false, cancellationId: null },
    checkpoint: checkpoint(),
    tasks: [{
      taskId: claim.taskId,
      state: "running",
      attempt: claim.attempt,
      activeClaimId: claim.claimId,
      effectStarted: true,
    }],
    transitionSequence: 2,
    transitionReceipts: [],
    ...overrides,
  };
}

describe("Workflow task execution failure-boundary coverage", () => {
  it("normalizes durable-storage failure for every public repository operation", async () => {
    const plan = admittedPlan();
    const storage = {
      get: async () => { throw new Error("durable get unavailable"); },
      transaction: async () => { throw new Error("durable transaction unavailable"); },
    } as unknown as DurableObjectStorage;
    const repository = new DurableWorkflowStateRepository(storage);
    const claim: WorkflowTaskClaim = {
      executionId: plan.executionId,
      planId: plan.planId,
      taskId: "publish",
      claimId: "claim-storage-failure",
      attempt: 1,
      effect: "side_effecting",
    };
    const expectedFailure = WorkflowStateStoreUnavailableError;

    await expect(repository.readState(plan)).rejects.toThrowError(expectedFailure);
    await expect(repository.initialize(plan, checkpoint())).rejects.toThrowError(expectedFailure);
    await expect(repository.claimNextRunnableTask(plan, "claim-next-storage-failure")).rejects.toThrowError(expectedFailure);
    await expect(repository.claimRunnableTask(plan, "publish", "claim-named-storage-failure")).rejects.toThrowError(expectedFailure);
    await expect(repository.markEffectStarted(plan, claim)).rejects.toThrowError(expectedFailure);
    await expect(repository.requestCancellation(plan, "cancel-storage-failure")).rejects.toThrowError(expectedFailure);
    await expect(repository.completeTask(plan, claim, "succeeded")).rejects.toThrowError(expectedFailure);
    await expect(repository.recoverInterruptedTask(plan, claim)).rejects.toThrowError(expectedFailure);
    await expect(repository.resolveBlockedDescendants(plan)).rejects.toThrowError(expectedFailure);
    await expect(repository.commitCheckpoint(plan, checkpoint(), checkpoint(1, "b"))).rejects.toThrowError(expectedFailure);
  });

  it("rejects every malformed retained claim identity before state mutation", async () => {
    const plan = admittedPlan();
    const objectName = await workflowStateObjectName(plan.executionId);
    const object = new NoemaWorkflowState({
      id: { name: objectName } as DurableObjectId,
      storage: new TransactionalStorage(),
    } as unknown as DurableObjectState);
    const endpoint = "https://noema-workflow-state.internal/command";
    const request = (body?: Record<string, unknown>, includeContentType = true) => object.fetch(new Request(endpoint, {
      method: "POST",
      headers: includeContentType ? { "content-type": "application/json" } : undefined,
      body: body === undefined ? undefined : JSON.stringify(body),
    }));

    expect((await request(undefined, false)).status).toBe(415);
    expect((await request({ operation: "initialize", plan, checkpoint: checkpoint() })).status).toBe(200);
    const claimed = await request({
      operation: "claim_runnable",
      plan,
      taskId: "publish",
      claimId: "claim-shape-authority",
    });
    expect(claimed.status).toBe(200);
    const claim = (await claimed.json() as { data: WorkflowTaskClaim }).data;

    const malformedClaims: readonly unknown[] = [
      { ...claim, executionId: "exec-foreign" },
      { ...claim, planId: "plan-foreign" },
      { ...claim, taskId: 7 },
      { ...claim, taskId: "foreign" },
    ];
    for (const malformedClaim of malformedClaims) {
      const response = await request({
        operation: "mark_effect_started",
        plan,
        claim: malformedClaim,
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ ok: false, error: "invalid_request" });
    }
  });

  it("rejects effect-start and terminal snapshots from foreign execution authority", async () => {
    const plan = admittedPlan();
    const claim: WorkflowTaskClaim = {
      executionId: plan.executionId,
      planId: plan.planId,
      taskId: "publish",
      claimId: "claim-runner-authority",
      attempt: 1,
      effect: "side_effecting",
    };
    const execute = vi.fn(async () => "succeeded" as const);

    const foreignEffectStartPort = {
      claimNextRunnableTask: vi.fn(async () => claim),
      markEffectStarted: vi.fn(async () => snapshot(claim, { executionId: "exec-foreign" })),
      completeTask: vi.fn(),
    };
    await expect(
      executeNextWorkflowTask(plan, claim.claimId, foreignEffectStartPort, { execute }),
    ).rejects.toThrowError(WorkflowTaskEffectAuthorityError);
    expect(execute).not.toHaveBeenCalled();
    expect(foreignEffectStartPort.completeTask).not.toHaveBeenCalled();

    const effectStartSnapshot = snapshot(claim);
    const foreignTerminalPort = {
      claimNextRunnableTask: vi.fn(async () => claim),
      markEffectStarted: vi.fn(async () => effectStartSnapshot),
      completeTask: vi.fn(async () => snapshot(claim, {
        planId: "plan-foreign",
        tasks: [{
          taskId: claim.taskId,
          state: "succeeded",
          attempt: claim.attempt,
          activeClaimId: null,
          effectStarted: true,
        }],
        transitionSequence: effectStartSnapshot.transitionSequence + 1,
      })),
    };
    await expect(
      executeNextWorkflowTask(plan, claim.claimId, foreignTerminalPort, { execute }),
    ).rejects.toThrowError(WorkflowTaskTerminalAuthorityError);
  });
});
