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
});
