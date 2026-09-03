import { describe, expect, it } from "vitest";

import { admitWorkflowTaskPlan } from "../src/workflow-task-execution/task-plan";
import {
  DurableWorkflowStateRepository,
  MAX_AUTOMATIC_RECOVERY_ATTEMPTS,
  MAX_TRANSITION_RECEIPTS,
  WorkflowStateConflictError,
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

const key = "workflow-state:v1:exec-integrity-001:plan-integrity-001";
const admittedPlan = () => admitWorkflowTaskPlan({
  executionId: "exec-integrity-001",
  planId: "plan-integrity-001",
  maxConcurrency: 1,
  tasks: [{ taskId: "only", dependsOn: [], effect: "pure" }],
});

const initialized = async () => {
  const storage = new Storage();
  const repository = new DurableWorkflowStateRepository(storage as unknown as DurableObjectStorage);
  const admitted = admittedPlan();
  await repository.initialize(admitted, {
    executionId: admitted.executionId,
    sequence: 0,
    stateDigest: "a".repeat(64),
  });
  return { storage, repository, admitted };
};

type MutableReceipt = {
  transitionSequence: number;
  transitionType: string;
  taskId: string | null;
  claimId: string | null;
  attempt: number | null;
  cancellationId: string | null;
  resultingState: string | null;
  checkpointSequence: number;
  checkpointStateDigest: string;
};

type MutableRecord = {
  transitionSequence?: number;
  transitionReceipts?: MutableReceipt[] | null;
  checkpoint: { executionId: string };
  tasks: Array<{
    taskId: string;
    attempt: number;
    effectStarted?: unknown;
  }>;
};

type RecordMutation = readonly [label: string, mutate: (record: MutableRecord) => void];
type ReceiptMutation = readonly [label: string, mutate: (receipt: MutableReceipt) => void];

const malformedLedgerCases: readonly RecordMutation[] = [
  ["non-integer sequence", (record) => { record.transitionSequence = 1.5; }],
  ["non-array receipts", (record) => { record.transitionReceipts = null; }],
  ["sequence below retained length", (record) => { record.transitionSequence = 0; }],
];

const malformedReceiptCases: readonly ReceiptMutation[] = [
  ["non-contiguous sequence", (receipt) => { receipt.transitionSequence = 2; }],
  ["unknown type", (receipt) => { receipt.transitionType = "foreign_transition"; }],
  ["unknown task", (receipt) => { receipt.taskId = "foreign-task"; }],
  ["malformed claim", (receipt) => { receipt.claimId = " bad claim "; }],
  ["invalid attempt", (receipt) => { receipt.attempt = MAX_AUTOMATIC_RECOVERY_ATTEMPTS + 1; }],
  ["malformed cancellation", (receipt) => { receipt.cancellationId = "\n"; }],
  ["invalid resulting state", (receipt) => { receipt.resultingState = "unknown"; }],
  ["invalid checkpoint sequence", (receipt) => { receipt.checkpointSequence = -1; }],
  ["invalid checkpoint digest", (receipt) => { receipt.checkpointStateDigest = "A".repeat(64); }],
];

function mutableRecord(storage: Storage): MutableRecord {
  return structuredClone(storage.records.get(key)) as MutableRecord;
}

function firstReceipt(record: MutableRecord): MutableReceipt {
  return record.transitionReceipts![0]!;
}

describe("Workflow durable-state integrity regressions", () => {
  it("rejects a stored checkpoint whose execution identity diverges from the workflow record", async () => {
    const { storage, repository, admitted } = await initialized();
    const record = mutableRecord(storage);
    record.checkpoint.executionId = "exec-foreign-checkpoint";
    storage.records.set(key, record);

    await expect(repository.readState(admitted)).rejects.toThrowError(
      /checkpoint execution identity.*workflow/i,
    );
  });

  it("rejects an impossible stored attempt count above the repository recovery ceiling", async () => {
    const { storage, repository, admitted } = await initialized();
    const record = mutableRecord(storage);
    record.tasks[0]!.attempt = MAX_AUTOMATIC_RECOVERY_ATTEMPTS + 1;
    storage.records.set(key, record);

    await expect(repository.readState(admitted)).rejects.toThrowError(WorkflowStateConflictError);
  });

  it("reads a pre-ledger durable record without fabricating historical provenance", async () => {
    const { storage, repository, admitted } = await initialized();
    const record = mutableRecord(storage);
    delete record.transitionSequence;
    delete record.transitionReceipts;
    delete record.tasks[0]!.effectStarted;
    storage.records.set(key, record);

    const retained = await repository.readState(admitted);
    expect(retained.transitionSequence).toBe(0);
    expect(retained.transitionReceipts).toEqual([]);
    expect(retained.tasks[0]?.effectStarted).toBeNull();
  });

  it("keeps legacy pure pending work recoverable when effect-start evidence predates the ledger", async () => {
    const { storage, repository, admitted } = await initialized();
    const record = mutableRecord(storage);
    delete record.transitionSequence;
    delete record.transitionReceipts;
    delete record.tasks[0]!.effectStarted;
    storage.records.set(key, record);

    const claim = await repository.claimRunnableTask(admitted, "only", "claim-legacy-pure-001");
    expect(claim).toMatchObject({
      taskId: "only",
      attempt: 1,
      effect: "pure",
    });

    const retained = await repository.readState(admitted);
    expect(retained.tasks[0]).toMatchObject({
      state: "running",
      effectStarted: false,
    });
    expect(retained.transitionReceipts).toHaveLength(1);
    expect(retained.transitionReceipts[0]).toMatchObject({
      transitionSequence: 1,
      transitionType: "task_claimed",
      taskId: "only",
      claimId: "claim-legacy-pure-001",
    });
  });

  it("rejects a partially present transition ledger", async () => {
    const { storage, repository, admitted } = await initialized();
    const record = mutableRecord(storage);
    delete record.transitionReceipts;
    storage.records.set(key, record);

    await expect(repository.readState(admitted)).rejects.toThrowError(/transition ledger.*partially/i);
  });

  it.each(malformedLedgerCases)("rejects malformed transition ledger metadata: %s", async (_label, mutate) => {
    const { storage, repository, admitted } = await initialized();
    const record = mutableRecord(storage);
    mutate(record);
    storage.records.set(key, record);

    await expect(repository.readState(admitted)).rejects.toThrowError(WorkflowStateConflictError);
  });

  it("rejects a transition ledger larger than its bounded retention contract", async () => {
    const { storage, repository, admitted } = await initialized();
    const record = mutableRecord(storage);
    const receipt = firstReceipt(record);
    record.transitionSequence = MAX_TRANSITION_RECEIPTS + 1;
    record.transitionReceipts = Array.from({ length: MAX_TRANSITION_RECEIPTS + 1 }, (_, index) => ({
      ...receipt,
      transitionSequence: index + 1,
    }));
    storage.records.set(key, record);

    await expect(repository.readState(admitted)).rejects.toThrowError(/bounded contract/i);
  });

  it.each(malformedReceiptCases)("rejects malformed transition receipt evidence: %s", async (_label, mutate) => {
    const { storage, repository, admitted } = await initialized();
    const record = mutableRecord(storage);
    mutate(firstReceipt(record));
    storage.records.set(key, record);

    await expect(repository.readState(admitted)).rejects.toThrowError(WorkflowStateConflictError);
  });

  it("rejects malformed effect-start evidence in durable task state", async () => {
    const { storage, repository, admitted } = await initialized();
    const record = mutableRecord(storage);
    record.tasks[0]!.effectStarted = "yes";
    storage.records.set(key, record);

    await expect(repository.readState(admitted)).rejects.toThrowError(/effect-start evidence/i);
  });

  it("rejects pending durable task state that already claims the effect boundary was crossed", async () => {
    const { storage, repository, admitted } = await initialized();
    const record = mutableRecord(storage);
    record.tasks[0]!.effectStarted = true;
    storage.records.set(key, record);

    await expect(repository.readState(admitted)).rejects.toThrowError(/pending.*effect-start|effect-start.*pending/i);
  });

  it("records effect start once for the exact active claim", async () => {
    const { repository, admitted } = await initialized();
    const claim = await repository.claimRunnableTask(admitted, "only", "claim-effect-start-001");

    const first = await repository.markEffectStarted(admitted, claim);
    const replay = await repository.markEffectStarted(admitted, claim);

    expect(first.tasks[0]?.effectStarted).toBe(true);
    expect(replay).toEqual(first);
    expect(first.transitionReceipts.filter(({ transitionType }) => transitionType === "effect_started")).toHaveLength(1);
  });

  it("rejects a reused plan identity that changes a task's dependency graph", async () => {
    const storage = new Storage();
    const repository = new DurableWorkflowStateRepository(storage as unknown as DurableObjectStorage);
    const original = admitWorkflowTaskPlan({
      executionId: "exec-dependency-001",
      planId: "plan-dependency-001",
      maxConcurrency: 3,
      tasks: [
        { taskId: "root", dependsOn: [], effect: "pure" },
        { taskId: "other", dependsOn: [], effect: "pure" },
        { taskId: "child", dependsOn: ["root"], effect: "pure" },
      ],
    });
    await repository.initialize(original, {
      executionId: original.executionId,
      sequence: 0,
      stateDigest: "a".repeat(64),
    });

    const droppedDependency = admitWorkflowTaskPlan({
      executionId: "exec-dependency-001",
      planId: "plan-dependency-001",
      maxConcurrency: 3,
      tasks: [
        { taskId: "root", dependsOn: [], effect: "pure" },
        { taskId: "other", dependsOn: [], effect: "pure" },
        { taskId: "child", dependsOn: [], effect: "pure" },
      ],
    });
    await expect(repository.readState(droppedDependency)).rejects.toThrowError(WorkflowStateConflictError);
    await expect(
      repository.claimRunnableTask(droppedDependency, "child", "claim-dependency-dropped-001"),
    ).rejects.toThrowError(WorkflowStateConflictError);

    const substitutedDependency = admitWorkflowTaskPlan({
      executionId: "exec-dependency-001",
      planId: "plan-dependency-001",
      maxConcurrency: 3,
      tasks: [
        { taskId: "root", dependsOn: [], effect: "pure" },
        { taskId: "other", dependsOn: [], effect: "pure" },
        { taskId: "child", dependsOn: ["other"], effect: "pure" },
      ],
    });
    await expect(repository.readState(substitutedDependency)).rejects.toThrowError(WorkflowStateConflictError);

    const sameDependencyGraph = admitWorkflowTaskPlan({
      executionId: "exec-dependency-001",
      planId: "plan-dependency-001",
      maxConcurrency: 3,
      tasks: [
        { taskId: "root", dependsOn: [], effect: "pure" },
        { taskId: "other", dependsOn: [], effect: "pure" },
        { taskId: "child", dependsOn: ["root"], effect: "pure" },
      ],
    });
    await expect(repository.readState(sameDependencyGraph)).resolves.toBeDefined();
  });

  it("rejects a stored task dependency list that is not a canonical array", async () => {
    const { storage, repository, admitted } = await initialized();
    const record = mutableRecord(storage);
    (record.tasks[0] as unknown as { dependsOn: unknown }).dependsOn = "only";
    storage.records.set(key, record);

    await expect(repository.readState(admitted)).rejects.toThrowError(WorkflowStateConflictError);
  });

  it("rejects a stored task_claimed receipt with all required identity fields null", async () => {
    const { storage, repository, admitted } = await initialized();
    await repository.claimRunnableTask(admitted, "only", "claim-field-contract-001");
    const record = mutableRecord(storage);
    const claimedReceipt = record.transitionReceipts!.find(
      (receipt) => receipt.transitionType === "task_claimed",
    )!;
    claimedReceipt.taskId = null;
    claimedReceipt.claimId = null;
    claimedReceipt.attempt = null;
    claimedReceipt.resultingState = null;
    storage.records.set(key, record);

    await expect(repository.readState(admitted)).rejects.toThrowError(
      /transition receipt fields do not match/i,
    );
  });

  it("rejects a stored initialized receipt that fabricates a task identity", async () => {
    const { storage, repository, admitted } = await initialized();
    const record = mutableRecord(storage);
    firstReceipt(record).taskId = "only";
    storage.records.set(key, record);

    await expect(repository.readState(admitted)).rejects.toThrowError(
      /transition receipt fields do not match/i,
    );
  });
});
