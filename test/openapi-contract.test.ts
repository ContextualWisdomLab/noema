import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function loadOpenApi(): Promise<Record<string, any>> {
  const bytes = await readFile(new URL("../openapi.json", import.meta.url), "utf8");
  return JSON.parse(bytes) as Record<string, any>;
}

function resolveLocalRef(spec: Record<string, any>, value: Record<string, any>): Record<string, any> {
  const ref = value?.$ref;
  if (typeof ref !== "string" || !ref.startsWith("#/")) {
    return value;
  }

  return resolveLocalRef(
    spec,
    ref
      .slice(2)
      .split("/")
      .reduce<Record<string, any>>((current, segment) => current?.[segment], spec),
  );
}

function schemaMatchesString(spec: Record<string, any>, schema: Record<string, any>, value: string): boolean {
  const resolved = resolveLocalRef(spec, schema);
  if (Array.isArray(resolved.allOf)) {
    return resolved.allOf.every((part: Record<string, any>) => schemaMatchesString(spec, part, value));
  }
  if (resolved.not) {
    return !schemaMatchesString(spec, resolved.not, value);
  }
  if (typeof resolved.pattern === "string") {
    return new RegExp(resolved.pattern).test(value);
  }
  return true;
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
    expect(spec.paths["/exchange"].post.responses["415"]).toBeDefined();
    expect(spec.paths["/exchange"].post.responses["429"]).toBeDefined();
    expect(spec.paths["/exchange"].post.responses["500"]).toBeDefined();
    expect(spec.paths["/exchange"].post.responses["502"]).toBeDefined();
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
    expect(exchange.requestBody.content["application/json"].schema).toEqual({
      $ref: "#/components/schemas/ExchangeRequest",
    });
    expect(exchange["x-request-body-limit-bytes"]).toBe(8192);
    expect(exchange.responses["401"].headers["WWW-Authenticate"]).toBeDefined();
    expect(exchange.responses["429"].headers["Retry-After"]).toBeDefined();
  });

  it("executes the RE2-safe repository locator against realistic owner/name values", async () => {
    const spec = await loadOpenApi();
    const locator = spec.components.schemas.RepositoryLocator;
    const requestSchema = resolveLocalRef(spec, spec.paths["/exchange"].post.requestBody.content["application/json"].schema);
    const successRepository = resolveLocalRef(
      spec,
      resolveLocalRef(spec, spec.paths["/exchange"].post.responses["200"].content["application/json"].schema)
        .properties.data.properties.repository,
    );

    expect(JSON.stringify(locator)).not.toMatch(/\(\?[=!<]/);
    expect(requestSchema.properties.target_repository).toEqual({ $ref: "#/components/schemas/RepositoryLocator" });
    expect(successRepository).toEqual(locator);

    const accepted = [
      "ContextualWisdomLab/.github",
      "ContextualWisdomLab/noema",
      "ContextualWisdomLab/a",
      `ContextualWisdomLab/${"r".repeat(100)}`,
    ];
    const rejected = [
      "ContextualWisdomLab/..",
      "ContextualWisdomLab/.",
      "../noema",
      "./noema",
      "ContextualWisdomLab/%2e%2e",
      "ContextualWisdomLab/noema/extra",
      "ContextualWisdomLab//noema",
      "ContextualWisdomLab\\noema",
      "ContextualWisdomLab/\u2024\u2024",
      "ContextualWisdomLab/\uFF0E\uFF0E",
      `ContextualWisdomLab/${"r".repeat(101)}`,
    ];

    for (const value of accepted) {
      expect(schemaMatchesString(spec, locator, value), value).toBe(true);
    }
    for (const value of rejected) {
      expect(schemaMatchesString(spec, locator, value), value).toBe(false);
    }
  });

  it("keeps the common non-cacheable diagnostic headers on every exchange response", async () => {
    const spec = await loadOpenApi();
    const responses = spec.paths["/exchange"].post.responses;
    const commonHeaders = [
      "Cache-Control",
      "Pragma",
      "X-Content-Type-Options",
      "X-Trace-Id",
      "X-Latency-Ms",
    ];

    for (const status of ["200", "400", "401", "403", "405", "413", "415", "429", "500", "502", "503"]) {
      const response = resolveLocalRef(spec, responses[status]);
      for (const header of commonHeaders) {
        expect(response.headers?.[header], `${status} ${header}`).toBeDefined();
      }
    }
  });

  it("documents distributed rate-limit and replay headers where runtime guarantees them", async () => {
    const spec = await loadOpenApi();
    const responses = spec.paths["/exchange"].post.responses;
    const distributedRateLimitHeaders = [
      "X-Rate-Limit-Limit",
      "X-Rate-Limit-Remaining",
      "X-Rate-Limit-Scope",
    ];

    for (const status of ["200", "401", "403", "429", "500", "502"]) {
      const response = resolveLocalRef(spec, responses[status]);
      for (const header of distributedRateLimitHeaders) {
        expect(response.headers?.[header], `${status} ${header}`).toBeDefined();
      }
    }

    const success = resolveLocalRef(spec, responses["200"]);
    expect(success.headers?.["X-Oidc-Replay-Protection"]).toBeDefined();
  });

  it("documents readiness routing headers without exposing secret material", async () => {
    const raw = await readFile(new URL("../openapi.json", import.meta.url), "utf8");
    const spec = JSON.parse(raw) as Record<string, any>;
    const readyResponses = spec.paths["/ready"].get.responses;
    const readyHeadResponses = spec.paths["/ready"].head.responses;

    for (const status of ["200", "503"]) {
      const response = resolveLocalRef(spec, readyResponses[status]);
      expect(response.headers["X-Noema-Readiness"]).toBeDefined();
      expect(response.headers["X-Trace-Id"]).toBeDefined();
      expect(response.headers["X-Latency-Ms"]).toBeDefined();

      const headResponse = resolveLocalRef(spec, readyHeadResponses[status]);
      expect(headResponse.headers["X-Noema-Readiness"]).toBeDefined();
      expect(headResponse.headers["X-Trace-Id"]).toBeDefined();
      expect(headResponse.headers["X-Latency-Ms"]).toBeDefined();
      expect(headResponse.content).toBeUndefined();
    }
    expect(resolveLocalRef(spec, readyResponses["503"]).headers["Retry-After"]).toBeDefined();
    expect(resolveLocalRef(spec, readyHeadResponses["503"]).headers["Retry-After"]).toBeDefined();
    expect(raw).not.toMatch(/ghs_[A-Za-z0-9]+/);
    expect(raw).not.toMatch(/BEGIN (?:RSA )?PRIVATE KEY/);
  });
});
