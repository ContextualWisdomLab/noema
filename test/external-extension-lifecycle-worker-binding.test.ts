import { describe, expect, it } from "vitest";
import { readNoemaWorkerConfig } from "../scripts/lib/cloudflare-worker-config.mjs";

describe("external-extension lifecycle Worker binding", () => {
  it("declares one SQLite Durable Object binding/export for the canonical lifecycle authority", async () => {
    const config = await readNoemaWorkerConfig(process.cwd());

    expect(config.durableObjects).toContainEqual({
      name: "NOEMA_EXTERNAL_EXTENSION_LIFECYCLE",
      class_name: "NoemaExternalExtensionLifecycle",
    });
    expect(config.exports.NoemaExternalExtensionLifecycle).toEqual({
      type: "durable-object",
      storage: "sqlite",
    });
  });
});
