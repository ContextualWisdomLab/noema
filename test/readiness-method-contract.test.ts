import { describe, expect, it } from "vitest";
import entrypoint, { type Env } from "../src/runtime-entrypoint";

const env = {
  ALLOWED_ISSUER: "unused",
  ALLOWED_AUDIENCE: "unused",
  ALLOWED_REPOSITORY_OWNER: "unused",
  ALLOWED_WORKFLOW_REPOSITORY: "unused",
  ALLOWED_WORKFLOW_REF_PREFIX: "unused",
  GITHUB_API_BASE: "unused",
  GITHUB_APP_ID: "unused",
  GITHUB_APP_PRIVATE_KEY_PEM: "unused",
} as Env;

describe("readiness method contract", () => {
  it.each(["POST", "PUT", "PATCH", "DELETE", "OPTIONS"])(
    "rejects %s /ready without claiming a readiness decision",
    async (method) => {
      const response = await entrypoint.fetch(
        new Request("https://noema.example/ready", { method }),
        env,
      );

      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("GET, HEAD");
      expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
      expect(response.headers.get("x-noema-readiness")).toBeNull();
      expect(response.headers.get("retry-after")).toBeNull();
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("pragma")).toBe("no-cache");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      const traceId = response.headers.get("x-trace-id");
      expect(traceId).toEqual(expect.any(String));
      expect(response.headers.get("x-latency-ms")).toBeTruthy();
      const body = await response.json() as Record<string, unknown>;
      expect(body).toMatchObject({
        ok: false,
        error_code: "ERR_VALIDATION_INPUT",
        message: "Method not allowed",
        details: {
          allowed_methods: "GET, HEAD",
          hint: expect.any(String),
        },
      });
      expect(body.trace_id).toBe(traceId);
    },
  );
});
