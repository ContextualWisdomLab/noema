import { describe, expect, it } from "vitest";

import {
  DurableExternalExtensionLifecycleRepository,
  ExternalExtensionLifecycleConflictError,
  ExternalExtensionLifecycleValidationError,
  type ExternalExtensionLifecycleAppend,
  type ExternalExtensionLifecycleStreamIdentity,
} from "../src/tool-capability/external-extension-lifecycle-store";

class Storage {
  readonly records = new Map<string, unknown>();
  private transactionTail: Promise<void> = Promise.resolve();

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

  async transaction<T>(callback: (txn: Storage) => Promise<T>): Promise<T> {
    const predecessor = this.transactionTail;
    let release!: () => void;
    this.transactionTail = new Promise<void>((resolve) => { release = resolve; });
    await predecessor;
    try {
      return await callback(this);
    } finally {
      release();
    }
  }
}

const stream = (artifact = "a".repeat(64)): ExternalExtensionLifecycleStreamIdentity => ({
  external_extension_id: "review_helper",
  upstream_repository: "anthropics/claude-plugins-community",
  upstream_commit_sha: "b".repeat(40),
  upstream_path: "plugins/review-helper",
  artifact_sha256: artifact,
  marketplace_entry_sha256: "c".repeat(64),
});

const append = (
  overrides: Partial<ExternalExtensionLifecycleAppend> = {},
): ExternalExtensionLifecycleAppend => ({
  transition_id: "transition-0001",
  stream: stream(),
  expected_version: 0,
  prior_state: null,
  next_state: "discovered",
  policy_approval_reference: "urn:cwl:noema:approval:review_helper:v1",
  effective_scope_reference: "urn:cwl:noema:scope:developer_assist:v1",
  appguardrail_evidence_reference: "urn:cwl:appguardrail:receipt:scan-0001",
  appguardrail_profile_identity: "urn:cwl:appguardrail:profile:static-v1",
  quarantine_evidence_reference: "urn:cwl:quarantine:receipt:analysis-0001",
  quarantine_profile_identity: "urn:cwl:quarantine:profile:plugin-v1",
  isolation_profile_reference: "urn:cwl:quarantine:isolation:plugin-v1",
  egress_policy_reference: "urn:cwl:egressweave:policy:developer-assist-v1",
  occurred_at: "2026-09-09T09:10:00.000Z",
  causation_id: "cause-0001",
  correlation_id: "correlation-0001",
  actor_identity_handle: "service:noema",
  ...overrides,
});

async function toActive(repository: DurableExternalExtensionLifecycleRepository) {
  const states = [
    "discovered",
    "source_pinned",
    "statically_scanned",
    "quarantined",
    "capability_reviewed",
    "approved_for_pilot",
    "active",
  ] as const;

  await repository.append(append());
  for (let index = 1; index < states.length; index += 1) {
    await repository.append(append({
      transition_id: `transition-${String(index + 1).padStart(4, "0")}`,
      expected_version: index,
      prior_state: states[index - 1],
      next_state: states[index],
      causation_id: `cause-${String(index + 1).padStart(4, "0")}`,
    }));
  }
}

describe("external-extension durable lifecycle ledger", () => {
  it("reconstructs current authority after repository restart without process-local state", async () => {
    const storage = new Storage();
    const first = new DurableExternalExtensionLifecycleRepository(
      storage as unknown as DurableObjectStorage,
    );
    const accepted = await first.append(append());

    expect(accepted.kind).toBe("accepted");
    expect(accepted.snapshot).toMatchObject({ version: 1, state: "discovered" });

    const restarted = new DurableExternalExtensionLifecycleRepository(
      storage as unknown as DurableObjectStorage,
    );
    await expect(restarted.readCurrent(stream())).resolves.toMatchObject({
      version: 1,
      state: "discovered",
      head_event_sha256: accepted.event.event_sha256,
    });
  });

  it("rejects an illegal discovered to active shortcut", async () => {
    const storage = new Storage();
    const repository = new DurableExternalExtensionLifecycleRepository(
      storage as unknown as DurableObjectStorage,
    );
    await repository.append(append());

    await expect(repository.append(append({
      transition_id: "transition-0002",
      expected_version: 1,
      prior_state: "discovered",
      next_state: "active",
    }))).rejects.toThrowError(ExternalExtensionLifecycleValidationError);
  });

  it("treats an exact duplicate transition as replay and the same id with changed semantics as conflict", async () => {
    const storage = new Storage();
    const repository = new DurableExternalExtensionLifecycleRepository(
      storage as unknown as DurableObjectStorage,
    );
    const request = append();
    const first = await repository.append(request);
    const replay = await repository.append(request);

    expect(replay.kind).toBe("replay");
    expect(replay.event).toEqual(first.event);

    await expect(repository.append(append({
      next_state: "rejected",
    }))).rejects.toThrowError(ExternalExtensionLifecycleConflictError);
  });

  it("allows exactly one competing CAS append to win", async () => {
    const storage = new Storage();
    const repository = new DurableExternalExtensionLifecycleRepository(
      storage as unknown as DurableObjectStorage,
    );
    await repository.append(append());

    const contenders = await Promise.allSettled([
      repository.append(append({
        transition_id: "transition-0002a",
        expected_version: 1,
        prior_state: "discovered",
        next_state: "source_pinned",
      })),
      repository.append(append({
        transition_id: "transition-0002b",
        expected_version: 1,
        prior_state: "discovered",
        next_state: "rejected",
      })),
    ]);

    expect(contenders.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(contenders.filter(({ status }) => status === "rejected")).toHaveLength(1);
    const rejected = contenders.find(({ status }) => status === "rejected");
    expect(rejected).toMatchObject({
      status: "rejected",
      reason: expect.any(ExternalExtensionLifecycleConflictError),
    });
  });

  it("retains audit history beyond the workflow receipt ring-buffer size", async () => {
    const storage = new Storage();
    const repository = new DurableExternalExtensionLifecycleRepository(
      storage as unknown as DurableObjectStorage,
    );
    await toActive(repository);

    let version = 7;
    let priorState: "active" | "suspended" = "active";
    for (let index = 0; index < 130; index += 1) {
      const nextState = priorState === "active" ? "suspended" : "active";
      version += 1;
      await repository.append(append({
        transition_id: `cycle-${String(index).padStart(4, "0")}`,
        expected_version: version - 1,
        prior_state: priorState,
        next_state: nextState,
        causation_id: `cycle-cause-${String(index).padStart(4, "0")}`,
      }));
      priorState = nextState;
    }

    const events = await repository.readAudit(stream());
    expect(events).toHaveLength(137);
    expect(events[0]).toMatchObject({ version: 1, next_state: "discovered" });
    expect(events.at(-1)).toMatchObject({ version: 137, next_state: priorState });
  });

  it("partitions identical extension ids by exact artifact identity", async () => {
    const storage = new Storage();
    const repository = new DurableExternalExtensionLifecycleRepository(
      storage as unknown as DurableObjectStorage,
    );
    const firstStream = stream("a".repeat(64));
    const secondStream = stream("d".repeat(64));

    await repository.append(append({ stream: firstStream }));
    await repository.append(append({
      transition_id: "transition-foreign-artifact",
      stream: secondStream,
    }));

    await expect(repository.readAudit(firstStream)).resolves.toHaveLength(1);
    await expect(repository.readAudit(secondStream)).resolves.toHaveLength(1);
  });

  it("never persists caller-only secret or product payload fields", async () => {
    const storage = new Storage();
    const repository = new DurableExternalExtensionLifecycleRepository(
      storage as unknown as DurableObjectStorage,
    );
    const hostile = {
      ...append(),
      secret_material: "OPENAI_API_KEY=should-never-persist",
      product_record: "customer payroll row",
      hidden_reasoning: "private chain of thought",
    } as ExternalExtensionLifecycleAppend;

    await repository.append(hostile);
    const serialized = JSON.stringify([...storage.records.values()]);
    expect(serialized).not.toContain("OPENAI_API_KEY");
    expect(serialized).not.toContain("customer payroll row");
    expect(serialized).not.toContain("private chain of thought");
  });

  it("fails closed when stored audit evidence is truncated or malformed", async () => {
    const storage = new Storage();
    const repository = new DurableExternalExtensionLifecycleRepository(
      storage as unknown as DurableObjectStorage,
    );
    await repository.append(append());

    const eventKey = [...storage.records.keys()].find((key) => key.includes(":event:"));
    expect(eventKey).toBeDefined();
    const event = structuredClone(storage.records.get(eventKey!)) as Record<string, unknown>;
    event.event_sha256 = "0".repeat(64);
    storage.records.set(eventKey!, event);

    await expect(repository.readAudit(stream())).rejects.toThrowError(
      ExternalExtensionLifecycleConflictError,
    );
  });
});
