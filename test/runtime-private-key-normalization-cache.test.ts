import { beforeAll, describe, expect, it, vi } from "vitest";
import runtimeWorker, { type Env as RuntimeEnv } from "../src/runtime-entrypoint";

let appPrivateKeyPem: string;

function pemFromPkcs8(pkcs8: ArrayBuffer): string {
  const base64 = Buffer.from(pkcs8).toString("base64");
  const lines = base64.match(/.{1,64}/g)?.join("\n") ?? base64;
  return `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----`;
}

beforeAll(async () => {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
  appPrivateKeyPem = pemFromPkcs8(pkcs8);
});

function readinessEnv(privateKeyPem: string): RuntimeEnv {
  const namespace = {
    idFromName: vi.fn(),
    get: vi.fn(),
  } as unknown as DurableObjectNamespace;
  return {
    ALLOWED_ISSUER: "https://token.actions.githubusercontent.com",
    ALLOWED_AUDIENCE: "cwl-noema-review",
    ALLOWED_REPOSITORY_OWNER: "ContextualWisdomLab",
    ALLOWED_WORKFLOW_REPOSITORY: "ContextualWisdomLab/.github",
    ALLOWED_WORKFLOW_REF_PREFIX:
      "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main",
    ALLOWED_WORKFLOW_SHA: "a".repeat(40),
    GITHUB_API_BASE: "https://api.github.com",
    GITHUB_APP_ID: "1",
    GITHUB_APP_PRIVATE_KEY_PEM: privateKeyPem,
    NOEMA_RATE_LIMIT_PER_MINUTE: "1000",
    NOEMA_RATE_LIMITER: namespace,
    NOEMA_OIDC_REPLAY_GUARD: namespace,
  };
}

describe("runtime private-key normalization cache", () => {
  it("reuses the WebCrypto import decision for an unchanged newline-terminated secret", async () => {
    const env = readinessEnv(`${appPrivateKeyPem}\n`);
    const importSpy = vi.spyOn(crypto.subtle, "importKey");

    const first = await runtimeWorker.fetch(
      new Request("https://noema.example/ready"),
      env,
    );
    const second = await runtimeWorker.fetch(
      new Request("https://noema.example/ready"),
      env,
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(importSpy).toHaveBeenCalledTimes(1);
  });

  it("does not retain a withdrawn binding in the cached normalized environment", async () => {
    const env = readinessEnv(`${appPrivateKeyPem}\n`);

    const first = await runtimeWorker.fetch(
      new Request("https://noema.example/ready"),
      env,
    );
    expect(first.status).toBe(200);

    delete (env as Partial<RuntimeEnv>).GITHUB_APP_ID;

    const second = await runtimeWorker.fetch(
      new Request("https://noema.example/ready"),
      env,
    );
    expect(second.status).toBe(503);
    expect(await second.json()).toMatchObject({
      ok: false,
      error_code: "ERR_SERVICE_NOT_READY",
      details: {
        failed_checks: expect.stringContaining("github_app_id"),
      },
    });
  });
});
