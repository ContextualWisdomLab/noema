import { describe, expect, it } from "vitest";

import {
  DurableExternalExtensionLifecycleRepository,
  ExternalExtensionLifecycleConflictError,
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

function recordKey(storage: Storage, marker: string): string {
  const key = [...storage.records.keys()].find((candidate) => candidate.includes(marker));
  if (key === undefined) throw new Error(`missing test record ${marker}`);
  return key;
}

describe("external-extension lifecycle durable-head integrity", () => {
  it("rejects audit recovery when the persisted head schema or stream is forged", async () => {
    for (const mutation of ["schema", "stream"] as const) {
      const storage = new Storage();
      const repository = new DurableExternalExtensionLifecycleRepository(
        storage as unknown as DurableObjectStorage,
      );
      await repository.append(append());

      const headKey = recordKey(storage, ":head");
      const head = structuredClone(storage.records.get(headKey)) as Record<string, unknown>;
      if (mutation === "schema") {
        head.schema_version = 2;
      } else {
        head.stream = stream("f".repeat(64));
      }
      storage.records.set(headKey, head);

      await expect(repository.readAudit(stream())).rejects.toThrowError(
        ExternalExtensionLifecycleConflictError,
      );
    }
  });

  it("refuses to extend a corrupted durable head and leaves storage unchanged", async () => {
    const storage = new Storage();
    const repository = new DurableExternalExtensionLifecycleRepository(
      storage as unknown as DurableObjectStorage,
    );
    await repository.append(append());

    const headKey = recordKey(storage, ":head");
    const head = structuredClone(storage.records.get(headKey)) as Record<string, unknown>;
    head.head_event_sha256 = "0".repeat(64);
    storage.records.set(headKey, head);
    const before = JSON.stringify([...storage.records.entries()]);

    await expect(repository.append(append({
      transition_id: "transition-0002",
      expected_version: 1,
      prior_state: "discovered",
      next_state: "source_pinned",
      occurred_at: "2026-09-09T09:11:00.000Z",
      causation_id: "cause-0002",
    }))).rejects.toThrowError(ExternalExtensionLifecycleConflictError);
    expect(JSON.stringify([...storage.records.entries()])).toBe(before);
  });
});
