import { describe, expect, it } from "vitest";
import entrypoint, { type Env } from "../src/runtime-entrypoint";

function dummyNamespace(): DurableObjectNamespace {
  return {
    idFromName(name: string) {
      return { toString: () => name } as DurableObjectId;
    },
    get() {
      return {
        fetch: async () => new Response("unused", { status: 500 }),
      } as unknown as DurableObjectStub;
    },
  } as unknown as DurableObjectNamespace;
}

function callableNamespace(): DurableObjectNamespace {
  const callable = Object.assign(
    () => undefined,
    {
      idFromName(name: string) {
        return { toString: () => name } as DurableObjectId;
      },
      get() {
        return {
          fetch: async () => new Response("unused", { status: 500 }),
        } as unknown as DurableObjectStub;
      },
    },
  );
  return callable as unknown as DurableObjectNamespace;
}

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

async function readyEnvironment(): Promise<Env> {
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
    NOEMA_RATE_LIMITER: dummyNamespace(),
    NOEMA_OIDC_REPLAY_GUARD: dummyNamespace(),
  };
}

function readiness(env: Env): Promise<Response> {
  return entrypoint.fetch(new Request("https://noema.example/ready"), env);
}

describe("runtime-readiness distributed guard bindings", () => {
  it.each([
    ["NOEMA_RATE_LIMITER", "noema_rate_limiter"],
    ["NOEMA_OIDC_REPLAY_GUARD", "noema_oidc_replay_guard"],
  ] as const)(
    "fails closed when the %s binding is unavailable",
    async (bindingName, expectedCheck) => {
      const env = await readyEnvironment();
      (env as unknown as Record<string, unknown>)[bindingName] = undefined;

      const response = await readiness(env);

      expect(response.status).toBe(503);
      expect(response.headers.get("x-noema-readiness")).toBe("not-ready");
      await expect(response.json()).resolves.toMatchObject({
        ok: false,
        error_code: "ERR_SERVICE_NOT_READY",
        details: { failed_checks: expectedCheck },
      });
    },
  );

  it.each([
    ["primitive", "NOEMA_RATE_LIMITER", "misconfigured"],
    ["missing idFromName", "NOEMA_RATE_LIMITER", { get: () => undefined }],
    ["missing get", "NOEMA_OIDC_REPLAY_GUARD", { idFromName: () => undefined }],
  ] as const)(
    "fails closed for a %s %s binding",
    async (_caseName, bindingName, malformedBinding) => {
      const env = await readyEnvironment();
      (env as unknown as Record<string, unknown>)[bindingName] = malformedBinding;

      const response = await readiness(env);

      expect(response.status).toBe(503);
      expect(response.headers.get("x-noema-readiness")).toBe("not-ready");
    },
  );

  it("accepts a callable binding only when both namespace methods are present", async () => {
    const env = await readyEnvironment();
    env.NOEMA_RATE_LIMITER = callableNamespace();

    const response = await readiness(env);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-noema-readiness")).toBe("ready");
  });
});
