import { describe, expect, it } from "vitest";

import { admitWorkflowTaskPlan, type WorkflowTaskPlan } from "../src/workflow-task-execution/task-plan";
import { DurableWorkflowStateRepository } from "../src/workflow-task-execution/workflow-state-store";
import { reconstructActiveTaskClaim } from "../src/workflow-task-execution/workflow-recovery-claim";

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

const digest = "a".repeat(64);

const plan = (): WorkflowTaskPlan => ({
  executionId: "exec-recovery-claim-001",
  planId: "plan-recovery-claim-001",
  maxConcurrency: 1,
  tasks: [{ taskId: "publish", dependsOn: [], effect: "side_effecting" }],
});

const fixture = async () => {
  const storage = new Storage();
  const repository = new DurableWorkflowStateRepository(storage as unknown as DurableObjectStorage);
  const admitted = admitWorkflowTaskPlan(plan());
  await repository.initialize(admitted, {
    executionId: admitted.executionId,
    sequence: 0,
    stateDigest: digest,
  });
  return { storage, repository, admitted };
};

type FakeStoredTask = {
  taskId: string;
  state: string;
  attempt: number;
  activeClaimId: string | null;
};

function fakeSnapshot(
  admitted: { executionId: string; planId: string },
  tasks: readonly FakeStoredTask[],
): Parameters<typeof reconstructActiveTaskClaim>[1] {
  return {
    executionId: admitted.executionId,
    planId: admitted.planId,
    tasks,
  } as unknown as Parameters<typeof reconstructActiveTaskClaim>[1];
}

describe("reconstructActiveTaskClaim", () => {
  it("reconstructs the exact durable claim for an actively running task after restart", async () => {
    const { storage, repository, admitted } = await fixture();
    const claim = await repository.claimRunnableTask(admitted, "publish", "claim-recovery-claim-001");
    await repository.markEffectStarted(admitted, claim);

    const restarted = new DurableWorkflowStateRepository(storage as unknown as DurableObjectStorage);
    const snapshot = await restarted.readState(admitted);
    const reconstructed = reconstructActiveTaskClaim(admitted, snapshot, "publish");

    expect(reconstructed).toEqual(claim);

    const reconciled = await restarted.completeTask(admitted, reconstructed, "succeeded");
    expect(reconciled.tasks.find(({ taskId }) => taskId === "publish")?.state).toBe("succeeded");
  });

  it("rejects a snapshot from another execution or plan", async () => {
    const { admitted } = await fixture();
    const foreignSnapshot = fakeSnapshot({ executionId: "exec-other", planId: admitted.planId }, []);

    expect(() => reconstructActiveTaskClaim(admitted, foreignSnapshot, "publish")).toThrowError(
      /another execution or plan/i,
    );
  });

  it("rejects a task that does not belong to the admitted plan", async () => {
    const { admitted } = await fixture();
    const snapshot = fakeSnapshot(admitted, []);

    expect(() => reconstructActiveTaskClaim(admitted, snapshot, "unknown-task")).toThrowError(
      /does not belong to the admitted plan/i,
    );
  });

  it("rejects a plan-known task absent from the state snapshot", async () => {
    const { admitted } = await fixture();
    const snapshot = fakeSnapshot(admitted, []);

    expect(() => reconstructActiveTaskClaim(admitted, snapshot, "publish")).toThrowError(
      /no durable active claim/i,
    );
  });

  it("rejects a task that is not currently running", async () => {
    const { admitted } = await fixture();
    const snapshot = fakeSnapshot(admitted, [
      { taskId: "publish", state: "pending", attempt: 0, activeClaimId: null },
    ]);

    expect(() => reconstructActiveTaskClaim(admitted, snapshot, "publish")).toThrowError(
      /no durable active claim/i,
    );
  });

  it("rejects a running task with no durable active claim identity", async () => {
    const { admitted } = await fixture();
    const snapshot = fakeSnapshot(admitted, [
      { taskId: "publish", state: "running", attempt: 1, activeClaimId: null },
    ]);

    expect(() => reconstructActiveTaskClaim(admitted, snapshot, "publish")).toThrowError(
      /no durable active claim/i,
    );
  });
});
