import { describe, expect, it } from "vitest";

import {
  DurableExternalExtensionLifecycleRepository,
  ExternalExtensionLifecycleConflictError,
  type ExternalExtensionLifecycleAppend,
  type ExternalExtensionLifecycleStreamIdentity,
} from "../src/tool-capability/external-extension-lifecycle-store";

class ProjectionStorage {
  readonly records = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return structuredClone(this.records.get(key)) as T | undefined;
  }

  async put<T>(key: string, value: T): Promise<void> {
    this.records.set(key, structuredClone(value));
  }

  async list<T>(): Promise<Map<string, T>> {
    throw new Error("current projection must not scan append-only audit history");
  }

  async transaction<T>(callback: (txn: ProjectionStorage) => Promise<T>): Promise<T> {
    return callback(this);
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

const request: ExternalExtensionLifecycleAppend = {
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
};

describe("external-extension lifecycle current projection", () => {
  it("verifies only the bound audit tail rather than scanning full history", async () => {
    const storage = new ProjectionStorage();
    const repository = new DurableExternalExtensionLifecycleRepository(
      storage as unknown as DurableObjectStorage,
    );
    const accepted = await repository.append(request);

    await expect(repository.readCurrent(stream)).resolves.toEqual(accepted.snapshot);
  });

  it("fails closed when the compact head survives but its bound audit tail is missing", async () => {
    const storage = new ProjectionStorage();
    const repository = new DurableExternalExtensionLifecycleRepository(
      storage as unknown as DurableObjectStorage,
    );
    await repository.append(request);
    const tailKey = [...storage.records.keys()].find((key) => key.includes(":event:"));
    if (tailKey === undefined) throw new Error("missing audit tail fixture");
    storage.records.delete(tailKey);

    await expect(repository.readCurrent(stream)).rejects.toBeInstanceOf(
      ExternalExtensionLifecycleConflictError,
    );
  });
});
