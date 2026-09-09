import { describe, expect, it } from "vitest";
import {
  NoemaExternalExtensionLifecycle,
  externalExtensionLifecycleObjectName,
  routeExternalExtensionLifecycleCommand,
  type ExternalExtensionLifecycleDurableObjectEnv,
} from "../src/tool-capability/external-extension-lifecycle-durable-object";
import type {
  ExternalExtensionLifecycleAppend,
  ExternalExtensionLifecycleStreamIdentity,
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

const stream = (): ExternalExtensionLifecycleStreamIdentity => ({
  external_extension_id: "review_helper",
  upstream_repository: "anthropics/claude-plugins-community",
  upstream_commit_sha: "b".repeat(40),
  upstream_path: "plugins/review-helper",
  artifact_sha256: "a".repeat(64),
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

async function durableObject(storage = new Storage(), objectName?: string) {
  const name = objectName ?? await externalExtensionLifecycleObjectName(stream());
  const state = {
    storage: storage as unknown as DurableObjectStorage,
    id: { name },
  } as unknown as DurableObjectState;
  return { object: new NoemaExternalExtensionLifecycle(state), storage };
}

async function command(
  object: NoemaExternalExtensionLifecycle,
  body: unknown,
  contentType = "application/json",
): Promise<Response> {
  return object.fetch(new Request("https://noema-external-extension-lifecycle.internal/command", {
    method: "POST",
    headers: { "content-type": contentType },
    body: JSON.stringify(body),
  }));
}

describe("external-extension lifecycle Durable Object adapter", () => {
  it("routes one canonical stream to a deterministic private object and strips caller-only fields", async () => {
    const calls: Array<{ name: string; url: string; init?: RequestInit }> = [];
    const env = {
      NOEMA_EXTERNAL_EXTENSION_LIFECYCLE: {
        idFromName(name: string) { return { name } as unknown as DurableObjectId; },
        get(id: DurableObjectId) {
          return {
            async fetch(url: string, init?: RequestInit) {
              calls.push({ name: (id as unknown as { name: string }).name, url, init });
              return new Response("ok");
            },
          } as unknown as DurableObjectStub;
        },
      } as unknown as DurableObjectNamespace,
    } satisfies ExternalExtensionLifecycleDurableObjectEnv;
    const hostile = {
      ...append(),
      secret_material: "OPENAI_API_KEY=never-forward",
      product_record: "customer payroll row",
    } as ExternalExtensionLifecycleAppend;

    await routeExternalExtensionLifecycleCommand(env, { operation: "append", request: hostile });

    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe(await externalExtensionLifecycleObjectName(stream()));
    expect(calls[0].url).toBe("https://noema-external-extension-lifecycle.internal/command");
    const body = String(calls[0].init?.body);
    expect(body).not.toContain("OPENAI_API_KEY");
    expect(body).not.toContain("customer payroll row");
  });

  it("persists, reads the compact projection, and reads the full audit through the private boundary", async () => {
    const { object } = await durableObject();
    const accepted = await command(object, { operation: "append", request: append() });
    expect(accepted.status).toBe(200);
    await expect(accepted.json()).resolves.toMatchObject({ ok: true, data: { kind: "accepted" } });

    const current = await command(object, { operation: "read_current", stream: stream() });
    expect(current.status).toBe(200);
    await expect(current.json()).resolves.toMatchObject({
      ok: true,
      data: { version: 1, state: "discovered" },
    });

    const audit = await command(object, { operation: "read_audit", stream: stream() });
    expect(audit.status).toBe(200);
    const auditBody = await audit.json() as { data: unknown[] };
    expect(auditBody.data).toHaveLength(1);
  });

  it("fails closed for wrong transport, malformed commands, object substitution, and conflicting replay", async () => {
    const { object } = await durableObject();
    await expect(object.fetch(new Request("https://example.invalid/command", { method: "POST" })))
      .resolves.toMatchObject({ status: 404 });
    await expect(command(object, { operation: "read_current", stream: stream() }, "text/plain"))
      .resolves.toMatchObject({ status: 415 });
    await expect(object.fetch(new Request("https://noema-external-extension-lifecycle.internal/command", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    }))).resolves.toMatchObject({ status: 400 });
    await expect(command(object, { operation: "unknown" })).resolves.toMatchObject({ status: 400 });

    const substituted = await durableObject(new Storage(), "external-extension-lifecycle:wrong");
    await expect(command(substituted.object, { operation: "append", request: append() }))
      .resolves.toMatchObject({ status: 409 });

    await command(object, { operation: "append", request: append() });
    await expect(command(object, {
      operation: "append",
      request: append({ occurred_at: "2026-09-09T09:10:01.000Z" }),
    })).resolves.toMatchObject({ status: 409 });
  });

  it("does not permit a new active transition without a current authority verifier", async () => {
    const { object } = await durableObject();
    const states = [
      "discovered",
      "source_pinned",
      "statically_scanned",
      "quarantined",
      "capability_reviewed",
      "approved_for_pilot",
    ] as const;

    for (let index = 0; index < states.length; index += 1) {
      const response = await command(object, {
        operation: "append",
        request: append({
          transition_id: `transition-${String(index + 1).padStart(4, "0")}`,
          expected_version: index,
          prior_state: index === 0 ? null : states[index - 1],
          next_state: states[index],
          causation_id: `cause-${String(index + 1).padStart(4, "0")}`,
        }),
      });
      expect(response.status).toBe(200);
    }

    const active = await command(object, {
      operation: "append",
      request: append({
        transition_id: "transition-0007",
        expected_version: 6,
        prior_state: "approved_for_pilot",
        next_state: "active",
        causation_id: "cause-0007",
      }),
    });
    expect(active.status).toBe(412);
    await expect(active.json()).resolves.toEqual({ ok: false, error: "evidence_unavailable" });
  });

  it("normalizes validation and unexpected storage failures without exposing raw exception detail", async () => {
    const { object } = await durableObject();
    const invalid = await command(object, {
      operation: "read_current",
      stream: { ...stream(), artifact_sha256: "bad" },
    });
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toEqual({ ok: false, error: "invalid_request" });

    const storage = new Storage();
    storage.get = async () => { throw new Error("sensitive backend detail"); };
    const failing = await durableObject(storage);
    const response = await command(failing.object, { operation: "read_current", stream: stream() });
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("sensitive backend detail");
  });
});
