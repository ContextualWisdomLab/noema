import { describe, expect, it } from "vitest";

import type { ExecutionCheckpoint } from "../src/state-checkpoint/checkpoint-admission";
import { admitWorkflowTaskPlan, type WorkflowTaskPlan } from "../src/workflow-task-execution/task-plan";
import {
  DurableWorkflowStateRepository,
  WorkflowStateConflictError,
  WorkflowStateStoreUnavailableError,
  type WorkflowTaskClaim,
} from "../src/workflow-task-execution/workflow-state-store";

type MutableRecord = {
  schemaVersion: number;
  executionId: string;
  planId: string;
  maxConcurrency: number;
  tasks: Array<{
    taskId: string;
    effect: "pure" | "idempotent" | "side_effecting";
    state: "pending" | "running" | "succeeded" | "failed" | "cancelled";
    attempt: number;
    activeClaimId: string | null;
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

const mutateRecord = (storage: Storage, mutate: (record: MutableRecord) => void): void => {
  const record = structuredClone(storage.records.get(stateKey)) as MutableRecord;
  mutate(record);
  storage.records.set(stateKey, record);
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
    await expect(emptyRepository.readState(admitted)).rejects.toThrowError(/not been initialized/i);

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
      /cannot advance safely/i,
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
});
