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
  async transaction<T>(callback: (txn: Storage) => Promise<T>): Promise<T> {
    return callback(this);
  }
}

const setup = async (effect: "pure" | "idempotent" | "side_effecting" = "side_effecting") => {
  const storage = new Storage();
  const repository = new DurableWorkflowStateRepository(storage as unknown as DurableObjectStorage);
  const plan = admitWorkflowTaskPlan({
    executionId: "exec-runner-001",
    planId: "plan-runner-001",
    maxConcurrency: 1,
    tasks: [{ taskId: "publish", dependsOn: [], effect }],
  });
  await repository.initialize(plan, {
    executionId: plan.executionId,
    sequence: 0,
    stateDigest: "a".repeat(64),
  });
  return { repository, plan };
};

describe("Workflow task runner application boundary", () => {
  it("persists claim and effect-start authority before invoking the effect port", async () => {
    const { repository, plan } = await setup();
    const execute = vi.fn(async (claim: { taskId: string }) => {
      const duringEffect = await repository.readState(plan);
      expect(claim.taskId).toBe("publish");
      expect(duringEffect.tasks[0]).toMatchObject({
        taskId: "publish",
        state: "running",
        effectStarted: true,
      });
      expect(duringEffect.transitionReceipts.map(({ transitionType }) => transitionType)).toEqual([
        "initialized",
        "task_claimed",
        "effect_started",
      ]);
      return "succeeded" as const;
    });

    const result = await executeNextWorkflowTask(plan, "claim-publish-001", repository, { execute });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(result.claim).toMatchObject({ taskId: "publish", claimId: "claim-publish-001", attempt: 1 });
    expect(result.snapshot.tasks[0]).toMatchObject({
      taskId: "publish",
      state: "succeeded",
      effectStarted: true,
    });
    expect(result.snapshot.transitionReceipts.map(({ transitionType }) => transitionType)).toEqual([
      "initialized",
      "task_claimed",
      "effect_started",
      "task_completed",
    ]);
  });

  it("leaves an effect-started claim running when the effect port throws", async () => {
    const { repository, plan } = await setup();
    const execute = vi.fn(async () => {
      throw new Error("effect transport became uncertain");
    });

    await expect(
      executeNextWorkflowTask(plan, "claim-publish-uncertain", repository, { execute }),
    ).rejects.toThrowError(/transport became uncertain/i);

    const retained = await repository.readState(plan);
    expect(retained.tasks[0]).toMatchObject({
      taskId: "publish",
      state: "running",
      activeClaimId: "claim-publish-uncertain",
      effectStarted: true,
    });
    expect(retained.transitionReceipts.map(({ transitionType }) => transitionType)).toEqual([
      "initialized",
      "task_claimed",
      "effect_started",
    ]);
    await expect(
      repository.recoverInterruptedTask(plan, {
        executionId: plan.executionId,
        planId: plan.planId,
        taskId: "publish",
        claimId: "claim-publish-uncertain",
        attempt: 1,
        effect: "side_effecting",
      }),
    ).rejects.toThrowError(/explicit outcome or compensation/i);
  });

  it("never calls the effect port when effect-start persistence fails", async () => {
    const { repository, plan } = await setup("pure");
    const execute = vi.fn(async () => "succeeded" as const);
    const statePort = {
      claimNextRunnableTask: repository.claimNextRunnableTask.bind(repository),
      markEffectStarted: vi.fn(async () => {
        throw new Error("durable write unavailable");
      }),
      completeTask: repository.completeTask.bind(repository),
    };

    await expect(
      executeNextWorkflowTask(plan, "claim-before-effect-001", statePort, { execute }),
    ).rejects.toThrowError(/durable write unavailable/i);
    expect(execute).not.toHaveBeenCalled();
  });
});
