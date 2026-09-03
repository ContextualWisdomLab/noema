import { describe, expect, it, vi } from "vitest";

import * as checkpointAdmission from "../src/state-checkpoint/checkpoint-admission";
import type { ExecutionCheckpoint } from "../src/state-checkpoint/checkpoint-admission";
import { admitWorkflowTaskPlan, type WorkflowTaskPlan } from "../src/workflow-task-execution/task-plan";
import {
  DurableWorkflowStateRepository,
  MAX_AUTOMATIC_RECOVERY_ATTEMPTS,
  WorkflowStateConflictError,
  WorkflowStateStoreUnavailableError,
  type WorkflowTaskClaim,
} from "../src/workflow-task-execution/workflow-state-store";
import * as taskPlan from "../src/workflow-task-execution/task-plan";

type MutableRecord = {
  schemaVersion: number;
  executionId: string;
  planId: string;
  maxConcurrency: number;
  policy: {
    policyVersion: string;
    schedulingPolicy: string;
    maxAutomaticRecoveryAttempts: number;
  };
  cancellation: { requested: boolean; cancellationId: string | null };
  tasks: Array<{
    taskId: string;
    effect: "pure" | "idempotent" | "side_effecting";
    state: "pending" | "running" | "succeeded" | "failed" | "cancelled";
    attempt: number;
    activeClaimId: string | null;
    effectStarted?: boolean;
  }>;
  checkpoint: ExecutionCheckpoint;
};

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

const digest = (character: string): string => character.repeat(64);
const stateKey = "workflow-state:v1:exec-state-store-failures:plan-state-store-failures";
const uninitializedState = /not been initialized|plan authority is missing/i;

const plan = (): WorkflowTaskPlan => ({
  executionId: "exec-state-store-failures",
  planId: "plan-state-store-failures",
  maxConcurrency: 1,
  tasks: [
    { taskId: "first", dependsOn: [], effect: "pure" },
    { taskId: "second", dependsOn: ["first"], effect: "side_effecting" },
  ],
});

const checkpoint = (sequence = 0, character = "a"): ExecutionCheckpoint => ({
  executionId: "exec-state-store-failures",
  sequence,
  stateDigest: digest(character),
});

const fixture = async () => {
  const storage = new Storage();
  const repository = new DurableWorkflowStateRepository(storage as unknown as DurableObjectStorage);
  const admitted = admitWorkflowTaskPlan(plan());
  await repository.initialize(admitted, checkpoint());
  return { storage, repository, admitted };
};

const mutateRecord = (
  storage: Storage,
  mutate: (record: MutableRecord) => void,
  key: string = stateKey,
): void => {
  const record = structuredClone(storage.records.get(key)) as MutableRecord;
  mutate(record);
  storage.records.set(key, record);
};

describe("Workflow state-store failure contracts", () => {
  it("rejects invalid initialization authority and conflicting repeated initialization", async () => {
    const storage = new Storage();
    const repository = new DurableWorkflowStateRepository(storage as unknown as DurableObjectStorage);
    const admitted = admitWorkflowTaskPlan(plan());

    await expect(repository.initialize(admitted, { ...checkpoint(), executionId: "exec-other" })).rejects.toThrowError(
      WorkflowStateConflictError,
    );
    await expect(repository.initialize(admitted, { ...checkpoint(), sequence: 1 })).rejects.toThrowError(
      /initial checkpoint/i,
    );

    const first = await repository.initialize(admitted, checkpoint());
    await expect(repository.initialize(admitted, checkpoint())).resolves.toEqual(first);
    await expect(repository.initialize(admitted, { ...checkpoint(), stateDigest: digest("b") })).rejects.toThrowError(
      /different checkpoint/i,
    );
  });

  it("fails closed when state is absent or stored plan identity is corrupted", async () => {
    const emptyStorage = new Storage();
    const emptyRepository = new DurableWorkflowStateRepository(emptyStorage as unknown as DurableObjectStorage);
    const admitted = admitWorkflowTaskPlan(plan());
    await expect(emptyRepository.readState(admitted)).rejects.toThrowError(uninitializedState);

    const { storage, repository } = await fixture();
    mutateRecord(storage, (record) => {
      record.schemaVersion = 2;
    });
    await expect(repository.readState(admitted)).rejects.toThrowError(/does not match/i);
  });

  it("rejects malformed stored task and claim invariants", async () => {
    const cases: Array<(record: MutableRecord) => void> = [
      (record) => { record.tasks[0]!.taskId = "foreign"; },
      (record) => { record.tasks[0]!.effect = "side_effecting"; },
      (record) => { record.tasks[0]!.attempt = -1; },
      (record) => { record.tasks[0]!.activeClaimId = " bad claim "; },
      (record) => { record.tasks[0]!.state = "running"; record.tasks[0]!.activeClaimId = null; },
      (record) => { record.tasks[0]!.state = "pending"; record.tasks[0]!.activeClaimId = "claim-stale"; },
    ];

    for (const corrupt of cases) {
      const { storage, repository, admitted } = await fixture();
      mutateRecord(storage, corrupt);
      await expect(repository.readState(admitted)).rejects.toThrowError(WorkflowStateConflictError);
    }
  });

  it("rejects malformed claim identity, unknown tasks, and exhausted attempt counters", async () => {
    const { storage, repository, admitted } = await fixture();
    await expect(repository.claimRunnableTask(admitted, "first", " bad claim ")).rejects.toThrowError(/claim identity/i);
    await expect(repository.claimRunnableTask(admitted, "foreign", "claim-foreign")).rejects.toThrowError(
      /not runnable/i,
    );

    mutateRecord(storage, (record) => {
      record.tasks[0]!.attempt = Number.MAX_SAFE_INTEGER;
    });
    await expect(repository.claimRunnableTask(admitted, "first", "claim-overflow")).rejects.toThrowError(
      /attempt.*recovery contract/i,
    );
  });

  it("rejects stale completion authority and non-canonical terminal outcomes", async () => {
    const { repository, admitted } = await fixture();
    const claim = await repository.claimRunnableTask(admitted, "first", "claim-first");
    const stale: WorkflowTaskClaim = { ...claim, claimId: "claim-other" };

    await expect(repository.completeTask(admitted, stale, "succeeded")).rejects.toThrowError(/stale/i);
    await expect(repository.completeTask(admitted, claim, "unknown" as "succeeded")).rejects.toThrowError(
      /terminal outcome/i,
    );
    await repository.markEffectStarted(admitted, claim);
    await repository.completeTask(admitted, claim, "failed");
    await expect(repository.completeTask(admitted, claim, "failed")).rejects.toThrowError(/stale/i);
  });

  it("rejects cross-plan claim fields before task lookup", async () => {
    const { repository, admitted } = await fixture();
    const claim = await repository.claimRunnableTask(admitted, "first", "claim-first");
    const forged = [
      { ...claim, executionId: "exec-other" },
      { ...claim, planId: "plan-other" },
      { ...claim, claimId: " invalid " },
      { ...claim, attempt: 0 },
      { ...claim, taskId: "foreign" },
      { ...claim, effect: "side_effecting" as const },
    ];

    for (const candidate of forged) {
      await expect(repository.completeTask(admitted, candidate, "succeeded")).rejects.toThrowError(
        WorkflowStateConflictError,
      );
    }
  });

  it("rejects stale checkpoint expectations and inadmissible successors", async () => {
    const { repository, admitted } = await fixture();
    await expect(
      repository.commitCheckpoint(admitted, { ...checkpoint(), stateDigest: digest("d") }, checkpoint(1, "b")),
    ).rejects.toThrowError(/compare-and-swap/i);
    await expect(repository.commitCheckpoint(admitted, checkpoint(), checkpoint(2, "b"))).rejects.toThrowError(
      /successor is not admissible/i,
    );
    await expect(repository.commitCheckpoint(admitted, checkpoint(), { ...checkpoint(1, "b"), executionId: "exec-other" })).rejects.toThrowError(
      /successor is not admissible/i,
    );
  });

  it("normalizes durable storage failures without converting domain conflicts", async () => {
    const admitted = admitWorkflowTaskPlan(plan());
    const errorStorage = {
      get: async () => { throw new Error("read unavailable"); },
      transaction: async () => { throw new Error("transaction unavailable"); },
    } as unknown as DurableObjectStorage;
    const repository = new DurableWorkflowStateRepository(errorStorage);

    await expect(repository.readState(admitted)).rejects.toThrowError(WorkflowStateStoreUnavailableError);
    await expect(repository.initialize(admitted, checkpoint())).rejects.toThrowError(WorkflowStateStoreUnavailableError);

    const nonErrorStorage = {
      get: async () => { throw "opaque failure"; },
    } as unknown as DurableObjectStorage;
    await expect(new DurableWorkflowStateRepository(nonErrorStorage).readState(admitted)).rejects.toThrowError(
      WorkflowStateStoreUnavailableError,
    );
  });

  it("rejects stored causal corruption rather than publishing it as a snapshot", async () => {
    const { storage, repository, admitted } = await fixture();
    mutateRecord(storage, (record) => {
      record.tasks[0]!.state = "failed";
      record.tasks[1]!.state = "succeeded";
    });
    await expect(repository.readState(admitted)).rejects.toThrowError(/not admissible/i);
  });

  it("fails closed for every mutating operation invoked before initialization", async () => {
    const storage = new Storage();
    const repository = new DurableWorkflowStateRepository(storage as unknown as DurableObjectStorage);
    const admitted = admitWorkflowTaskPlan(plan());
    const claim: WorkflowTaskClaim = {
      executionId: admitted.executionId,
      planId: admitted.planId,
      taskId: "first",
      claimId: "claim-uninitialized",
      attempt: 1,
      effect: "pure",
    };

    await expect(repository.claimNextRunnableTask(admitted, "claim-next-uninitialized")).rejects.toThrowError(
      uninitializedState,
    );
    await expect(repository.claimRunnableTask(admitted, "first", "claim-named-uninitialized")).rejects.toThrowError(
      uninitializedState,
    );
    await expect(repository.markEffectStarted(admitted, claim)).rejects.toThrowError(uninitializedState);
    await expect(repository.requestCancellation(admitted, "cancel-uninitialized")).rejects.toThrowError(
      uninitializedState,
    );
    await expect(repository.completeTask(admitted, claim, "succeeded")).rejects.toThrowError(
      uninitializedState,
    );
    await expect(repository.recoverInterruptedTask(admitted, claim)).rejects.toThrowError(uninitializedState);
    await expect(repository.resolveBlockedDescendants(admitted)).rejects.toThrowError(uninitializedState);
    await expect(
      repository.commitCheckpoint(admitted, checkpoint(), checkpoint(1, "b")),
    ).rejects.toThrowError(uninitializedState);
  });

  it("rejects claimNextRunnableTask when no task is currently runnable", async () => {
    const { repository, admitted } = await fixture();
    await repository.claimRunnableTask(admitted, "first", "claim-first-running");

    await expect(repository.claimNextRunnableTask(admitted, "claim-none-runnable")).rejects.toThrowError(
      /no runnable task/i,
    );
  });

  it("normalizes a non-admission-error thrown by checkpoint admission instead of masking it", async () => {
    const { repository, admitted } = await fixture();
    // assertRecordMatchesPlan self-checks the retained checkpoint through one real
    // admitExecutionCheckpoint call before commitCheckpoint makes its own; only the second
    // call should surface the boundary violation this test exercises.
    const original = checkpointAdmission.admitExecutionCheckpoint;
    const admissionSpy = vi
      .spyOn(checkpointAdmission, "admitExecutionCheckpoint")
      .mockImplementationOnce(original)
      .mockImplementationOnce(() => {
        throw new Error("checkpoint admission boundary violated its own contract");
      });

    try {
      await expect(
        repository.commitCheckpoint(admitted, checkpoint(), checkpoint(1, "b")),
      ).rejects.toThrowError(WorkflowStateStoreUnavailableError);
    } finally {
      admissionSpy.mockRestore();
    }
  });

  it("rejects a malformed cancellation identity before it reaches durable storage", async () => {
    const { repository, admitted } = await fixture();
    await expect(repository.requestCancellation(admitted, " bad cancellation ")).rejects.toThrowError(
      /cancellation identity/i,
    );
  });

  it("rejects stored execution policy and cancellation-authority corruption", async () => {
    const policyCases: Array<(record: MutableRecord) => void> = [
      (record) => { record.policy.policyVersion = "workflow-execution-policy.v0"; },
      (record) => { record.cancellation.requested = true; record.cancellation.cancellationId = null; },
      (record) => { record.cancellation.requested = false; record.cancellation.cancellationId = "cancel-orphaned"; },
      (record) => { record.tasks[0]!.state = "unknown" as MutableRecord["tasks"][number]["state"]; },
    ];

    for (const corrupt of policyCases) {
      const { storage, repository, admitted } = await fixture();
      mutateRecord(storage, corrupt);
      await expect(repository.readState(admitted)).rejects.toThrowError(WorkflowStateConflictError);
    }
  });

  it("normalizes a non-Error thrown while validating retained runnable-task state", async () => {
    const { repository, admitted } = await fixture();
    const selectSpy = vi
      .spyOn(taskPlan, "selectRunnableWorkflowTasks")
      .mockImplementationOnce(() => {
        throw "opaque runnable-selection failure";
      });

    try {
      await expect(repository.readState(admitted)).rejects.toThrowError(/unknown state validation failure/i);
    } finally {
      selectSpy.mockRestore();
    }
  });

  it("forbids claiming a named task once cancellation has been requested", async () => {
    const { repository, admitted } = await fixture();
    await repository.requestCancellation(admitted, "cancel-before-named-claim");

    await expect(repository.claimRunnableTask(admitted, "first", "claim-after-cancel-named")).rejects.toThrowError(
      /cancelled; new task claims are forbidden/i,
    );
  });

  it("refuses to claim a pending side-effecting task whose effect-start evidence predates the ledger", async () => {
    const storage = new Storage();
    const repository = new DurableWorkflowStateRepository(storage as unknown as DurableObjectStorage);
    const admitted = admitWorkflowTaskPlan({
      executionId: "exec-legacy-side-effect",
      planId: "plan-legacy-side-effect",
      maxConcurrency: 1,
      tasks: [{ taskId: "publish", dependsOn: [], effect: "side_effecting" }],
    });
    await repository.initialize(admitted, {
      executionId: "exec-legacy-side-effect",
      sequence: 0,
      stateDigest: digest("a"),
    });
    mutateRecord(storage, (record) => {
      delete record.tasks[0]!.effectStarted;
    }, "workflow-state:v1:exec-legacy-side-effect:plan-legacy-side-effect");

    await expect(repository.claimRunnableTask(admitted, "publish", "claim-legacy-publish")).rejects.toThrowError(
      /unstarted effect-boundary evidence/i,
    );
  });

  it("refuses to claim a pending task whose stored attempt already reached the recovery ceiling", async () => {
    const { storage, repository, admitted } = await fixture();
    mutateRecord(storage, (record) => {
      record.tasks[0]!.attempt = MAX_AUTOMATIC_RECOVERY_ATTEMPTS;
    });

    await expect(repository.claimRunnableTask(admitted, "first", "claim-exhausted-pending")).rejects.toThrowError(
      /attempt counter cannot advance safely/i,
    );
  });
});
