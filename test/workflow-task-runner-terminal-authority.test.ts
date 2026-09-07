import { describe, expect, it, vi } from "vitest";

import { admitWorkflowTaskPlan } from "../src/workflow-task-execution/task-plan";
import { executeNextWorkflowTask } from "../src/workflow-task-execution/workflow-task-runner";
import { DurableWorkflowStateRepository } from "../src/workflow-task-execution/workflow-state-store";

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

describe("Workflow task runner terminal authority", () => {
  it("fails closed when completion returns no durable proof of the observed outcome", async () => {
    const storage = new Storage();
    const repository = new DurableWorkflowStateRepository(storage as unknown as DurableObjectStorage);
    const plan = admitWorkflowTaskPlan({
      executionId: "exec-runner-terminal-authority-001",
      planId: "plan-runner-terminal-authority-001",
      maxConcurrency: 1,
      tasks: [{ taskId: "publish", dependsOn: [], effect: "side_effecting" }],
    });
    await repository.initialize(plan, {
      executionId: plan.executionId,
      sequence: 0,
      stateDigest: "a".repeat(64),
    });

    const execute = vi.fn(async () => "succeeded" as const);
    const statePort = {
      claimNextRunnableTask: repository.claimNextRunnableTask.bind(repository),
      markEffectStarted: repository.markEffectStarted.bind(repository),
      completeTask: vi.fn(async () => repository.readState(plan)),
    };

    await expect(
      executeNextWorkflowTask(plan, "claim-terminal-authority-001", statePort, { execute }),
    ).rejects.toThrowError(/terminal authority/i);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(statePort.completeTask).toHaveBeenCalledTimes(1);

    const retained = await repository.readState(plan);
    expect(retained.tasks[0]).toMatchObject({
      taskId: "publish",
      state: "running",
      activeClaimId: "claim-terminal-authority-001",
      attempt: 1,
      effectStarted: true,
    });
    expect(retained.transitionReceipts.at(-1)?.transitionType).toBe("effect_started");
  });
});
