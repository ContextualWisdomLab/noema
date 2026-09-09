import { describe, expect, it } from "vitest";
import {
  NoemaExternalExtensionLifecycle,
  externalExtensionLifecycleObjectName,
} from "../src/tool-capability/external-extension-lifecycle-durable-object";
import type { ExternalExtensionLifecycleStreamIdentity } from "../src/tool-capability/external-extension-lifecycle-store";

const stream = (): ExternalExtensionLifecycleStreamIdentity => ({
  external_extension_id: "review_helper",
  upstream_repository: "anthropics/claude-plugins-community",
  upstream_commit_sha: "b".repeat(40),
  upstream_path: "plugins/review-helper",
  artifact_sha256: "a".repeat(64),
  marketplace_entry_sha256: "c".repeat(64),
});

async function object(databaseSize: number): Promise<NoemaExternalExtensionLifecycle> {
  const name = await externalExtensionLifecycleObjectName(stream());
  const storage = {
    sql: { databaseSize },
  } as unknown as DurableObjectStorage;
  const state = {
    storage,
    id: { name },
  } as unknown as DurableObjectState;
  return new NoemaExternalExtensionLifecycle(state);
}

describe("external-extension lifecycle storage observation", () => {
  it("reports the exact stream object SQLite database size through the private command boundary", async () => {
    const lifecycle = await object(8192);
    const response = await lifecycle.fetch(new Request(
      "https://noema-external-extension-lifecycle.internal/command",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation: "read_operability", stream: stream() }),
      },
    ));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: { database_size_bytes: 8192 },
    });
  });

  it("binds operability observation to the exact stream-scoped Durable Object", async () => {
    const storage = { sql: { databaseSize: 8192 } } as unknown as DurableObjectStorage;
    const state = {
      storage,
      id: { name: "external-extension-lifecycle:wrong" },
    } as unknown as DurableObjectState;
    const lifecycle = new NoemaExternalExtensionLifecycle(state);
    const response = await lifecycle.fetch(new Request(
      "https://noema-external-extension-lifecycle.internal/command",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation: "read_operability", stream: stream() }),
      },
    ));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "conflict" });
  });

  it.each([-1, 1.5])("fails closed when SQLite reports a non-canonical database size (%s)", async (databaseSize) => {
    const lifecycle = await object(databaseSize);
    const response = await lifecycle.fetch(new Request(
      "https://noema-external-extension-lifecycle.internal/command",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation: "read_operability", stream: stream() }),
      },
    ));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "internal_error" });
  });
});
