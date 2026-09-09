import { describe, expect, it } from "vitest";

import {
  DurableExternalExtensionLifecycleRepository,
  ExternalExtensionLifecycleConflictError,
  ExternalExtensionLifecycleEvidenceError,
  type ExternalExtensionLifecycleAppend,
  type ExternalExtensionLifecycleStreamIdentity,
} from "../src/tool-capability/external-extension-lifecycle-store";

class Storage {
  readonly records = new Map<string, unknown>();
  private transactionTail: Promise<void> = Promise.resolve();
  private transactionDepth = 0;
  private transactionCount = 0;
  private preflightBarrier: { remaining: number; released: Promise<void>; release: () => void } | null = null;
  private corruption: { transaction: number; marker: ":event:" | ":head" } | null = null;

  armTransitionPreflightBarrier(readers: number): void {
    let release!: () => void;
    const released = new Promise<void>((resolve) => { release = resolve; });
    this.preflightBarrier = { remaining: readers, released, release };
  }

  corruptBeforeTransaction(transaction: number, marker: ":event:" | ":head"): void {
    this.corruption = { transaction, marker };
  }

  async get<T>(key: string): Promise<T | undefined> {
    const value = structuredClone(this.records.get(key)) as T | undefined;
    const barrier = this.preflightBarrier;
    if (this.transactionDepth === 0 && barrier !== null && key.includes(":transition:")) {
      barrier.remaining -= 1;
      if (barrier.remaining === 0) barrier.release();
      await barrier.released;
    }
    return value;
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
    const predecessor = this.transactionTail;
    let release!: () => void;
    this.transactionTail = new Promise<void>((resolve) => { release = resolve; });
    await predecessor;
    this.transactionCount += 1;
    this.transactionDepth += 1;
    try {
      if (this.corruption?.transaction === this.transactionCount) {
        const key = [...this.records.keys()].find((candidate) => candidate.includes(this.corruption!.marker));
        if (key === undefined) throw new Error(`missing corruption target ${this.corruption.marker}`);
        this.records.delete(key);
      }
      return await callback(this);
    } finally {
      this.transactionDepth -= 1;
      release();
    }
  }
}

const stream: ExternalExtensionLifecycleStreamIdentity = {
  external_extension_id: "review_helper",
  upstream_repository: "anthropics/claude-plugins-community",
  upstream_commit_sha: "b".repeat(40),
  upstream_path: "plugins/review-helper",
  artifact_sha256: "a".repeat(64),
  marketplace_entry_sha256: "c".repeat(64),
};

const request = (
  overrides: Partial<ExternalExtensionLifecycleAppend> = {},
): ExternalExtensionLifecycleAppend => ({
  transition_id: "transition-0001",
  stream,
  expected_version: 0,
  prior_state: null,
  next_state: "discovered",
  policy_approval_reference: "urn:cwl:noema:approval:review_helper:v1",
  activation_policy_version: "urn:cwl:noema:external_extension_activation:developer-assist-v1",
  effective_scope_reference: "urn:cwl:noema:scope:developer_assist:v1",
  appguardrail_evidence_reference: "urn:cwl:appguardrail:receipt:scan-0001",
  appguardrail_profile_identity: "urn:cwl:appguardrail:profile:static-v1",
  appguardrail_profile_sha256: "d".repeat(64),
  quarantine_evidence_reference: "urn:cwl:quarantine:receipt:analysis-0001",
  quarantine_profile_identity: "urn:cwl:quarantine:profile:plugin-v1",
  quarantine_profile_sha256: "e".repeat(64),
  isolation_profile_reference: "urn:cwl:quarantine:isolation:plugin-v1",
  egress_policy_reference: "urn:cwl:egressweave:policy:developer-assist-v1",
  occurred_at: "2026-09-09T09:10:00.000Z",
  causation_id: "cause-0001",
  correlation_id: "correlation-0001",
  actor_identity_handle: "service:noema",
  ...overrides,
});

async function advanceToApprovedForPilot(repository: DurableExternalExtensionLifecycleRepository): Promise<void> {
  const states = [
    "discovered",
    "source_pinned",
    "statically_scanned",
    "quarantined",
    "capability_reviewed",
    "approved_for_pilot",
  ] as const;

  await repository.append(request());
  for (let index = 1; index < states.length; index += 1) {
    await repository.append(request({
      transition_id: `transition-${String(index + 1).padStart(4, "0")}`,
      expected_version: index,
      prior_state: states[index - 1],
      next_state: states[index],
      causation_id: `cause-${String(index + 1).padStart(4, "0")}`,
    }));
  }
}

describe("external-extension lifecycle idempotent replay", () => {
  it("replays an already committed activation without consulting mutable owner evidence again", async () => {
    const storage = new Storage();
    let evidenceCurrent = true;
    let verifierCalls = 0;
    const repository = new DurableExternalExtensionLifecycleRepository(
      storage as unknown as DurableObjectStorage,
      {
        async assertCurrentActivationEvidence() {
          verifierCalls += 1;
          if (!evidenceCurrent) {
            throw new ExternalExtensionLifecycleEvidenceError("owner evidence changed after commit");
          }
        },
      },
    );
    await advanceToApprovedForPilot(repository);
    const activation = request({
      transition_id: "transition-0007",
      expected_version: 6,
      prior_state: "approved_for_pilot",
      next_state: "active",
      causation_id: "cause-0007",
    });

    const accepted = await repository.append(activation);
    expect(accepted.kind).toBe("accepted");
    expect(verifierCalls).toBe(1);

    evidenceCurrent = false;
    const replay = await repository.append(activation);

    expect(replay.kind).toBe("replay");
    expect(replay.event).toEqual(accepted.event);
    expect(verifierCalls).toBe(1);
  });

  it("closes the transaction race by returning replay when identical requests pass preflight together", async () => {
    const storage = new Storage();
    storage.armTransitionPreflightBarrier(2);
    const repository = new DurableExternalExtensionLifecycleRepository(
      storage as unknown as DurableObjectStorage,
    );

    const outcomes = await Promise.all([
      repository.append(request()),
      repository.append(request()),
    ]);

    expect(outcomes.map(({ kind }) => kind).sort()).toEqual(["accepted", "replay"]);
    expect(outcomes[0].event).toEqual(outcomes[1].event);
    expect(outcomes[0].snapshot).toEqual(outcomes[1].snapshot);
  });

  it("closes the transaction race by rejecting the same transition id with different semantics", async () => {
    const storage = new Storage();
    storage.armTransitionPreflightBarrier(2);
    const repository = new DurableExternalExtensionLifecycleRepository(
      storage as unknown as DurableObjectStorage,
    );

    const outcomes = await Promise.allSettled([
      repository.append(request()),
      repository.append(request({ occurred_at: "2026-09-09T09:10:01.000Z" })),
    ]);

    expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === "rejected")).toHaveLength(1);
    expect(outcomes.find(({ status }) => status === "rejected")).toMatchObject({
      status: "rejected",
      reason: expect.any(ExternalExtensionLifecycleConflictError),
    });
  });

  it.each([":event:", ":head"] as const)(
    "fails closed when %s disappears after preflight but before the losing transaction rechecks idempotency",
    async (marker) => {
      const storage = new Storage();
      storage.armTransitionPreflightBarrier(2);
      storage.corruptBeforeTransaction(2, marker);
      const repository = new DurableExternalExtensionLifecycleRepository(
        storage as unknown as DurableObjectStorage,
      );

      const outcomes = await Promise.allSettled([
        repository.append(request()),
        repository.append(request()),
      ]);

      expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
      expect(outcomes.filter(({ status }) => status === "rejected")).toHaveLength(1);
      expect(outcomes.find(({ status }) => status === "rejected")).toMatchObject({
        status: "rejected",
        reason: expect.any(ExternalExtensionLifecycleConflictError),
      });
    },
  );
});
