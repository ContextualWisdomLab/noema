import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import entrypoint, { type Env } from "../src/entrypoint";

const distributedHeaders = [
  "X-Rate-Limit-Limit",
  "X-Rate-Limit-Remaining",
  "X-Rate-Limit-Scope",
] as const;

describe("OpenAPI exchange method boundary", () => {
  it("does not advertise distributed rate-limit evidence on the pre-limiter 405 response", async () => {
    const response = await entrypoint.fetch(
      new Request("https://noema.example/exchange", { method: "GET" }),
      {} as Env,
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    for (const header of distributedHeaders) {
      expect(response.headers.get(header)).toBeNull();
    }

    const spec = JSON.parse(
      await readFile(new URL("../openapi.json", import.meta.url), "utf8"),
    ) as Record<string, any>;
    const headers = spec.paths["/exchange"].post.responses["405"].headers;
    for (const header of distributedHeaders) {
      expect(headers[header], header).toBeUndefined();
    }
  });
});
