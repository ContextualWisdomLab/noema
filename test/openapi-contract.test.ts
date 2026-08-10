import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function loadOpenApi(): Promise<Record<string, any>> {
  const bytes = await readFile(new URL("../openapi.json", import.meta.url), "utf8");
  return JSON.parse(bytes) as Record<string, any>;
}

describe("machine-readable public HTTP contract", () => {
  it("publishes the supported health, readiness, and exchange surface", async () => {
    const spec = await loadOpenApi();

    expect(spec.openapi).toBe("3.1.0");
    expect(spec.info).toMatchObject({ title: "Noema API", version: "0.1.0" });
    expect(Object.keys(spec.paths).sort()).toEqual(["/exchange", "/health", "/ready"]);
    expect(spec.paths["/health"].get.responses["200"]).toBeDefined();
    expect(spec.paths["/ready"].get.responses["200"]).toBeDefined();
    expect(spec.paths["/ready"].get.responses["503"]).toBeDefined();
    expect(spec.paths["/ready"].head.responses["200"]).toBeDefined();
    expect(spec.paths["/ready"].head.responses["503"]).toBeDefined();
    expect(spec.paths["/exchange"].post.responses["200"]).toBeDefined();
    expect(spec.paths["/exchange"].post.responses["400"]).toBeDefined();
    expect(spec.paths["/exchange"].post.responses["401"]).toBeDefined();
    expect(spec.paths["/exchange"].post.responses["403"]).toBeDefined();
    expect(spec.paths["/exchange"].post.responses["405"]).toBeDefined();
    expect(spec.paths["/exchange"].post.responses["413"]).toBeDefined();
    expect(spec.paths["/exchange"].post.responses["429"]).toBeDefined();
    expect(spec.paths["/exchange"].post.responses["500"]).toBeDefined();
    expect(spec.paths["/exchange"].post.responses["503"]).toBeDefined();
  });

  it("keeps authentication and bounded-input semantics explicit", async () => {
    const spec = await loadOpenApi();
    const exchange = spec.paths["/exchange"].post;

    expect(exchange.security).toEqual([{ githubActionsOidc: [] }]);
    expect(spec.components.securitySchemes.githubActionsOidc).toMatchObject({
      type: "http",
      scheme: "bearer",
      bearerFormat: "GitHub Actions OIDC JWT",
    });
    expect(exchange.requestBody.required).toBe(false);
    expect(
      exchange.requestBody.content["application/json"].schema.properties.target_repository.pattern,
    ).toBe("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$");
    expect(exchange["x-request-body-limit-bytes"]).toBe(8192);
    expect(exchange.responses["401"].headers["WWW-Authenticate"]).toBeDefined();
    expect(exchange.responses["429"].headers["Retry-After"]).toBeDefined();
  });

  it("documents readiness routing headers without exposing secret material", async () => {
    const raw = await readFile(new URL("../openapi.json", import.meta.url), "utf8");
    const spec = JSON.parse(raw) as Record<string, any>;
    const readyResponses = spec.paths["/ready"].get.responses;

    for (const status of ["200", "503"]) {
      expect(readyResponses[status].headers["X-Noema-Readiness"]).toBeDefined();
      expect(readyResponses[status].headers["X-Trace-Id"]).toBeDefined();
      expect(readyResponses[status].headers["X-Latency-Ms"]).toBeDefined();
    }
    expect(readyResponses["503"].headers["Retry-After"]).toBeDefined();
    expect(raw).not.toMatch(/ghs_[A-Za-z0-9]+/);
    expect(raw).not.toMatch(/BEGIN (?:RSA )?PRIVATE KEY/);
  });
});
