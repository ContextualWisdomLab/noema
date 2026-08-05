import { afterEach, describe, expect, it, vi } from "vitest";
import entrypoint, { type Env } from "../src/runtime-entrypoint";

async function privateKeyPem(): Promise<string> {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
  const base64 = Buffer.from(pkcs8).toString("base64");
  const lines = base64.match(/.{1,64}/g)?.join("\n") ?? base64;
  return `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----`;
}

async function readyEnv(): Promise<Env> {
  return {
    ALLOWED_ISSUER: "https://token.actions.githubusercontent.com",
    ALLOWED_AUDIENCE: "cwl-noema-review",
    ALLOWED_REPOSITORY_OWNER: "ContextualWisdomLab",
    ALLOWED_WORKFLOW_REPOSITORY: "ContextualWisdomLab/.github",
    ALLOWED_WORKFLOW_REF_PREFIX:
      "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main",
    GITHUB_API_BASE: "https://api.github.com",
    GITHUB_APP_ID: "123456",
    GITHUB_APP_PRIVATE_KEY_PEM: await privateKeyPem(),
    GITHUB_APP_INSTALLATION_ID: "987654",
    NOEMA_RATE_LIMIT_PER_MINUTE: "60",
  };
}

async function readiness(env: Env, method = "GET"): Promise<Response> {
  return entrypoint.fetch(new Request("https://noema.example/ready", { method }), env);
}

describe("Noema runtime readiness", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("separates liveness from runtime readiness", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const env = await readyEnv();
    env.GITHUB_APP_ID = "";

    const health = await entrypoint.fetch(new Request("https://noema.example/health"), env);
    const ready = await readiness(env);

    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toMatchObject({
      ok: true,
      data: { name: "noema" },
    });
    expect(ready.status).toBe(503);
  });

  it("reports a stable, non-secret ready response when credential exchange configuration is usable", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const env = await readyEnv();

    const response = await readiness(env);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-noema-readiness")).toBe("ready");
    expect(response.headers.get("x-trace-id")).toBeTruthy();
    expect(response.headers.get("x-latency-ms")).toBeTruthy();
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        name: "noema",
        status: "ready",
        checks: { configuration: "pass" },
      },
      trace_id: expect.any(String),
    });
  });

  it("allows installation discovery when no fixed installation id is configured", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const env = await readyEnv();
    delete env.GITHUB_APP_INSTALLATION_ID;

    const response = await readiness(env);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-noema-readiness")).toBe("ready");
  });

  it.each([
    ["allowed_issuer", "ALLOWED_ISSUER", "https://issuer.example", "allowed_issuer"],
    ["allowed_audience", "ALLOWED_AUDIENCE", "contains whitespace", "allowed_audience"],
    [
      "allowed_repository_owner",
      "ALLOWED_REPOSITORY_OWNER",
      "invalid/owner",
      "allowed_repository_owner,allowed_workflow_repository",
    ],
    [
      "allowed_workflow_repository",
      "ALLOWED_WORKFLOW_REPOSITORY",
      "OtherOrg/.github",
      "allowed_workflow_repository,allowed_workflow_ref",
    ],
    [
      "allowed_workflow_ref",
      "ALLOWED_WORKFLOW_REF_PREFIX",
      "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/*",
      "allowed_workflow_ref",
    ],
    [
      "github_api_base",
      "GITHUB_API_BASE",
      "https://api.github.com.evil.example",
      "github_api_base",
    ],
    ["github_app_id", "GITHUB_APP_ID", "app-id-not-decimal", "github_app_id"],
    [
      "github_app_private_key",
      "GITHUB_APP_PRIVATE_KEY_PEM",
      "not-a-private-key",
      "github_app_private_key",
    ],
    [
      "github_app_installation_id",
      "GITHUB_APP_INSTALLATION_ID",
      "installation-id-not-decimal",
      "github_app_installation_id",
    ],
  ] as const)(
    "fails closed without reflecting the invalid %s value",
    async (_failureCode, field, invalidValue, expectedChecks) => {
      vi.spyOn(console, "log").mockImplementation(() => undefined);
      const env = await readyEnv();
      (env as unknown as Record<string, string>)[field] = invalidValue;

      const response = await readiness(env);
      const payload = await response.json() as Record<string, unknown>;
      const serialized = JSON.stringify(payload);

      expect(response.status).toBe(503);
      expect(response.headers.get("retry-after")).toBe("30");
      expect(response.headers.get("x-noema-readiness")).toBe("not-ready");
      expect(payload).toMatchObject({
        ok: false,
        error_code: "ERR_SERVICE_NOT_READY",
        message: "Noema credential exchange is not ready",
        details: {
          failed_checks: expectedChecks,
          hint: expect.any(String),
        },
        trace_id: expect.any(String),
      });
      expect(serialized).not.toContain(invalidValue);
      expect(serialized).not.toContain(env.GITHUB_APP_PRIVATE_KEY_PEM);
    },
  );

  it("reports every failed check in deterministic order without secret values", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const env = await readyEnv();
    const privateKey = env.GITHUB_APP_PRIVATE_KEY_PEM;
    env.ALLOWED_ISSUER = "";
    env.ALLOWED_AUDIENCE = "";
    env.GITHUB_APP_ID = "";
    env.GITHUB_APP_PRIVATE_KEY_PEM = "secret-private-key";

    const response = await readiness(env);
    const payload = await response.json() as {
      details: { failed_checks: string };
    };
    const serialized = JSON.stringify(payload);

    expect(payload.details.failed_checks).toBe(
      "allowed_issuer,allowed_audience,github_app_id,github_app_private_key",
    );
    expect(serialized).not.toContain("secret-private-key");
    expect(serialized).not.toContain(privateKey);
  });

  it("supports bodyless HEAD probes with the same readiness decision", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const response = await readiness(await readyEnv(), "HEAD");

    expect(response.status).toBe(200);
    expect(response.headers.get("x-noema-readiness")).toBe("ready");
    expect(await response.text()).toBe("");
  });

  it("rejects methods other than GET and HEAD", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const response = await readiness(await readyEnv(), "POST");

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, HEAD");
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_VALIDATION_INPUT",
      details: {
        allowed_methods: "GET, HEAD",
      },
    });
  });
});
