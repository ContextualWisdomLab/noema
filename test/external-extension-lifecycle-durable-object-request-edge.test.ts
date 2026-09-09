import { describe, expect, it } from "vitest";
import { NoemaExternalExtensionLifecycle } from "../src/tool-capability/external-extension-lifecycle-durable-object";

const endpoint = "https://noema-external-extension-lifecycle.internal/command";

function object(): NoemaExternalExtensionLifecycle {
  const state = {
    storage: {} as DurableObjectStorage,
    id: { name: undefined },
  } as unknown as DurableObjectState;
  return new NoemaExternalExtensionLifecycle(state);
}

function appendRequest(): Record<string, unknown> {
  return {
    transition_id: "transition-0001",
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
    occurred_at: "2026-09-09T09:10:00.000Z",
    causation_id: "cause-0001",
    correlation_id: "correlation-0001",
    actor_identity_handle: "service:noema",
  };
}

async function appendCommand(request: Record<string, unknown>): Promise<Response> {
  return object().fetch(new Request(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ operation: "append", request }),
  }));
}

describe("external-extension lifecycle Durable Object request envelope", () => {
  it("rejects a request with no JSON media type before body parsing", async () => {
    const response = await object().fetch(new Request(endpoint, { method: "POST" }));
    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "invalid_request" });
  });

  it("rejects a JSON scalar before lifecycle command dispatch", async () => {
    const response = await object().fetch(new Request(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "null",
    }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "invalid_request" });
  });

  it.each([
    ["transition_id", 7],
    ["expected_version", "0"],
    ["prior_state", 7],
  ])("rejects append scalar type confusion for %s", async (field, invalidValue) => {
    const response = await appendCommand({ ...appendRequest(), [field]: invalidValue });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "invalid_request" });
  });
});
