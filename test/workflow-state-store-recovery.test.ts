import { describe, expect, it } from "vitest";

import { reconstructActiveTaskClaim } from "../src/workflow-task-execution/workflow-recovery-claim";
import { admitWorkflowTaskPlan, type WorkflowTaskPlan } from "../src/workflow-task-execution/task-plan";
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
  async transaction<T>(callback: (txn: Storage) => Promise<T>): Promise<T> {
    return callback(this);
  }
}

const digest = "a".repeat(64);
const plan = (): WorkflowTaskPlan => ({
  executionId: "exec-recovery-001",
  planId: "plan-recovery-001",
  maxConcurrency: 2,
  tasks: [
    { taskId: "root", dependsOn: [], effect: "pure" },
    { taskId: "child", dependsOn: ["root"], effect: "idempotent" },
    { taskId: "grandchild", dependsOn: ["child"], effect: "side_effecting" },
    { taskId: "independent", dependsOn: [], effect: "pure" },
  ],
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
  return { repository, admitted };
};

describe("Workflow recovery semantics", () => {
  it("terminalizes descendants as blocked after a failed prerequisite while preserving independent work", async () => {
    const { repository, admitted } = await fixture();
    const root = await repository.claimRunnableTask(admitted, "root", "claim-root");
    await repository.markEffectStarted(admitted, root);
    await repository.completeTask(admitted, root, "failed");

    const recovered = await repository.resolveBlockedDescendants(admitted);
    expect(recovered.tasks.map(({ taskId, state }) => [taskId, state])).toEqual([
      ["root", "failed"],
      ["child", "blocked"],
      ["grandchild", "blocked"],
      ["independent", "pending"],
    ]);

    const independent = await repository.claimRunnableTask(
      admitted,
      "independent",
      "claim-independent",
    );
    expect(independent.taskId).toBe("independent");
  });

  it("bounds automatic pure-task recovery attempts and terminalizes exhausted work", async () => {
    const { repository, admitted } = await fixture();

    for (let attempt = 1; attempt <= MAX_AUTOMATIC_RECOVERY_ATTEMPTS; attempt += 1) {
      const claim = await repository.claimRunnableTask(admitted, "root", `claim-root-${attempt}`);
      const recovered = await repository.recoverInterruptedTask(admitted, claim);
      const state = recovered.tasks.find(({ taskId }) => taskId === "root")?.state;
      expect(state).toBe(attempt === MAX_AUTOMATIC_RECOVERY_ATTEMPTS ? "failed" : "pending");
    }

    const retained = await repository.resolveBlockedDescendants(admitted);
    expect(retained.tasks.find(({ taskId }) => taskId === "child")?.state).toBe("blocked");
    await expect(repository.claimRunnableTask(admitted, "root", "claim-root-over-limit")).rejects.toThrowError(
      /not runnable/i,
    );
  });

  it("bounds admission-order starvation so an independent task becomes next after recovery exhaustion", async () => {
    const { repository, admitted } = await fixture();

    for (let attempt = 1; attempt <= MAX_AUTOMATIC_RECOVERY_ATTEMPTS; attempt += 1) {
      const claim = await repository.claimNextRunnableTask(admitted, `claim-admission-root-${attempt}`);
      expect(claim.taskId).toBe("root");
      const recovered = await repository.recoverInterruptedTask(admitted, claim);
      expect(recovered.tasks.find(({ taskId }) => taskId === "root")?.state).toBe(
        attempt === MAX_AUTOMATIC_RECOVERY_ATTEMPTS ? "failed" : "pending",
      );
    }

    const next = await repository.claimNextRunnableTask(admitted, "claim-admission-independent");
    expect(next.taskId).toBe("independent");
    expect(next.attempt).toBe(1);

    const retained = await repository.readState(admitted);
    expect(retained.tasks.find(({ taskId }) => taskId === "child")?.state).toBe("blocked");
    expect(retained.tasks.find(({ taskId }) => taskId === "grandchild")?.state).toBe("blocked");
    expect(retained.tasks.find(({ taskId }) => taskId === "independent")?.state).toBe("running");
  });

  it("recovers a side-effecting claim when durable evidence proves the effect never started", async () => {
    const storage = new Storage();
    const repository = new DurableWorkflowStateRepository(storage as unknown as DurableObjectStorage);
    const admitted = admitWorkflowTaskPlan({
      executionId: "exec-side-effect-unstarted-001",
      planId: "plan-side-effect-unstarted-001",
      maxConcurrency: 1,
      tasks: [{ taskId: "publish", dependsOn: [], effect: "side_effecting" }],
    });
    await repository.initialize(admitted, {
      executionId: admitted.executionId,
      sequence: 0,
      stateDigest: digest,
    });

    const firstClaim = await repository.claimRunnableTask(admitted, "publish", "claim-publish-unstarted-001");
    const beforeRecovery = await repository.readState(admitted);
    expect(beforeRecovery.tasks[0]?.effectStarted).toBe(false);

    const recovered = await repository.recoverInterruptedTask(admitted, firstClaim);
    expect(recovered.tasks[0]).toMatchObject({
      taskId: "publish",
      state: "pending",
      attempt: 1,
      activeClaimId: null,
      effectStarted: false,
    });

    const secondClaim = await repository.claimRunnableTask(admitted, "publish", "claim-publish-unstarted-002");
    expect(secondClaim).toMatchObject({
      taskId: "publish",
      attempt: 2,
      effect: "side_effecting",
    });
  });

  it("fails closed when a retained side-effecting claim has no durable effect-start evidence", async () => {
    const storage = new Storage();
    const firstProcess = new DurableWorkflowStateRepository(storage as unknown as DurableObjectStorage);
    const admitted = admitWorkflowTaskPlan({
      executionId: "exec-side-effect-unknown-001",
      planId: "plan-side-effect-unknown-001",
      maxConcurrency: 1,
      tasks: [{ taskId: "publish", dependsOn: [], effect: "side_effecting" }],
    });
    await firstProcess.initialize(admitted, {
      executionId: admitted.executionId,
      sequence: 0,
      stateDigest: digest,
    });
    const claim = await firstProcess.claimRunnableTask(admitted, "publish", "claim-publish-unknown-001");

    const [key, stored] = [...storage.records.entries()][0]!;
    const legacyUnknown = structuredClone(stored) as {
      tasks: Array<{ taskId: string; effectStarted?: boolean }>;
    };
    delete legacyUnknown.tasks[0]!.effectStarted;
    storage.records.set(key, legacyUnknown);

    const restartedProcess = new DurableWorkflowStateRepository(storage as unknown as DurableObjectStorage);
    await expect(restartedProcess.recoverInterruptedTask(admitted, claim)).rejects.toThrowError(
      /effect-start evidence|reconciliation|malformed/i,
    );
  });

  it("reconstructs exact effect-started claim authority after restart before reconciling a side effect", async () => {
    const storage = new Storage();
    const firstProcess = new DurableWorkflowStateRepository(storage as unknown as DurableObjectStorage);
    const admitted = admitWorkflowTaskPlan({
      executionId: "exec-side-effect-restart-001",
      planId: "plan-side-effect-restart-001",
      maxConcurrency: 1,
      tasks: [{ taskId: "publish", dependsOn: [], effect: "side_effecting" }],
    });
    await firstProcess.initialize(admitted, {
      executionId: admitted.executionId,
      sequence: 0,
      stateDigest: digest,
    });
    const originalClaim = await firstProcess.claimRunnableTask(admitted, "publish", "claim-publish-001");
    await firstProcess.markEffectStarted(admitted, originalClaim);

    const restartedProcess = new DurableWorkflowStateRepository(storage as unknown as DurableObjectStorage);
    const retained = await restartedProcess.readState(admitted);
    expect(retained.tasks[0]?.effectStarted).toBe(true);
    const reconstructedClaim = reconstructActiveTaskClaim(admitted, retained, "publish");
    expect(reconstructedClaim).toEqual({
      executionId: retained.executionId,
      planId: retained.planId,
      taskId: "publish",
      claimId: "claim-publish-001",
      attempt: 1,
      effect: "side_effecting",
    });

    const reconciled = await restartedProcess.completeTask(admitted, reconstructedClaim, "succeeded");
    expect(reconciled.tasks.find(({ taskId }) => taskId === "publish")?.state).toBe("succeeded");
  });
});
