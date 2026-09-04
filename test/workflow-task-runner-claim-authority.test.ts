import { describe, expect, it, vi } from "vitest";

import { admitWorkflowTaskPlan } from "../src/workflow-task-execution/task-plan";
import { executeNextWorkflowTask } from "../src/workflow-task-execution/workflow-task-runner";
import {
  DurableWorkflowStateRepository,
  MAX_AUTOMATIC_RECOVERY_ATTEMPTS,
} from "../src/workflow-task-execution/workflow-state-store";

class Storage {
  readonly records = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.records.get(key) as T | undefined;
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

  async transaction<T>(callback: (txn: Storage) => Promise<T>): Promise<T> {
    return callback(this);
  }
}

describe("Workflow task runner claim authority", () => {
  it("rejects a state adapter that substitutes the admitted task effect before effect start", async () => {
    const storage = new Storage();
    const repository = new DurableWorkflowStateRepository(storage as unknown as DurableObjectStorage);
    const plan = admitWorkflowTaskPlan({
      executionId: "exec-runner-claim-authority-001",
      planId: "plan-runner-claim-authority-001",
      maxConcurrency: 1,
      tasks: [{ taskId: "publish", dependsOn: [], effect: "side_effecting" }],
    });
    await repository.initialize(plan, {
      executionId: plan.executionId,
      sequence: 0,
      stateDigest: "a".repeat(64),
    });

    const retainedClaim = await repository.claimNextRunnableTask(plan, "claim-authority-001");
    const substitutedClaim = Object.freeze({ ...retainedClaim, effect: "pure" as const });
    const execute = vi.fn(async () => "succeeded" as const);
    const statePort = {
      claimNextRunnableTask: vi.fn(async () => substitutedClaim),
      markEffectStarted: vi.fn(async () => repository.markEffectStarted(plan, retainedClaim)),
      completeTask: vi.fn(async (_plan: typeof plan, _claim: typeof retainedClaim, outcome: "succeeded" | "failed" | "cancelled") =>
        repository.completeTask(plan, retainedClaim, outcome)),
    };

    await expect(
      executeNextWorkflowTask(plan, "claim-authority-001", statePort, { execute }),
    ).rejects.toThrowError(/claim authority/i);
    expect(statePort.markEffectStarted).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(statePort.completeTask).not.toHaveBeenCalled();
  });

  it("rejects an impossible recovery attempt before effect-start persistence", async () => {
    const storage = new Storage();
    const repository = new DurableWorkflowStateRepository(storage as unknown as DurableObjectStorage);
    const plan = admitWorkflowTaskPlan({
      executionId: "exec-runner-claim-authority-002",
      planId: "plan-runner-claim-authority-002",
      maxConcurrency: 1,
      tasks: [{ taskId: "publish", dependsOn: [], effect: "idempotent" }],
    });
    await repository.initialize(plan, {
      executionId: plan.executionId,
      sequence: 0,
      stateDigest: "b".repeat(64),
    });

    const retainedClaim = await repository.claimNextRunnableTask(plan, "claim-authority-002");
    const impossibleClaim = Object.freeze({
      ...retainedClaim,
      attempt: MAX_AUTOMATIC_RECOVERY_ATTEMPTS + 1,
    });
    const execute = vi.fn(async () => "succeeded" as const);
    const statePort = {
      claimNextRunnableTask: vi.fn(async () => impossibleClaim),
      markEffectStarted: vi.fn(async () => repository.markEffectStarted(plan, retainedClaim)),
      completeTask: vi.fn(async (_plan: typeof plan, _claim: typeof retainedClaim, outcome: "succeeded" | "failed" | "cancelled") =>
        repository.completeTask(plan, retainedClaim, outcome)),
    };

    await expect(
      executeNextWorkflowTask(plan, "claim-authority-002", statePort, { execute }),
    ).rejects.toThrowError(/claim authority/i);
    expect(statePort.markEffectStarted).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(statePort.completeTask).not.toHaveBeenCalled();
  });
});
