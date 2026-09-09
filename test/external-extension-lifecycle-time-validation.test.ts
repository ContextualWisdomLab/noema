import { describe, expect, it } from "vitest";

import {
  DurableExternalExtensionLifecycleRepository,
  ExternalExtensionLifecycleValidationError,
  type ExternalExtensionLifecycleAppend,
} from "../src/tool-capability/external-extension-lifecycle-store";

class Storage {
  readonly records = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return structuredClone(this.records.get(key)) as T | undefined;
  }

  async put<T>(key: string, value: T): Promise<void> {
    this.records.set(key, structuredClone(value));
  }

  async list<T>(options: { prefix?: string } = {}): Promise<Map<string, T>> {
    const prefix = options.prefix ?? "";
    return new Map(
      [...this.records.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => [key, structuredClone(value) as T] as const),
    );
  }

  async transaction<T>(callback: (txn: Storage) => Promise<T>): Promise<T> {
    return callback(this);
  }
}

const request = (occurredAt: string): ExternalExtensionLifecycleAppend => ({
  transition_id: "transition-impossible-instant",
  stream: {
    external_extension_id: "review_helper",
    upstream_repository: "anthropics/claude-plugins-community",
    upstream_commit_sha: "b".repeat(40),
    upstream_path: "plugins/review-helper",
    artifact_sha256: "a".repeat(64),
    marketplace_entry_sha256: "c".repeat(64),
  },
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
  occurred_at: occurredAt,
  causation_id: "cause-impossible-instant",
  correlation_id: "correlation-impossible-instant",
  actor_identity_handle: "service:noema",
});

describe("external-extension lifecycle occurrence time", () => {
  it("rejects an impossible calendar instant before hashing or persistence", async () => {
    const storage = new Storage();
    const repository = new DurableExternalExtensionLifecycleRepository(
      storage as unknown as DurableObjectStorage,
    );

    await expect(repository.append(request("2026-09-31T11:00:00.000Z"))).rejects.toThrowError(
      ExternalExtensionLifecycleValidationError,
    );
    expect(storage.records.size).toBe(0);
  });
});
