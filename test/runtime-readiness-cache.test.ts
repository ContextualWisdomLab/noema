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
  };
}

function readiness(env: Env): Promise<Response> {
  return entrypoint.fetch(new Request("https://noema.example/ready"), env);
}

describe("runtime-readiness cryptographic evaluation cache", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("imports the App private key once for repeated probes in one immutable environment", async () => {
    const env = await readyEnvironment();
    const importKey = vi.spyOn(crypto.subtle, "importKey");

    const first = await readiness(env);
    const second = await readiness(env);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(importKey).toHaveBeenCalledTimes(1);
  });

  it("evaluates separate deployment environments independently", async () => {
    const firstEnvironment = await readyEnvironment();
    const secondEnvironment = await readyEnvironment();
    const importKey = vi.spyOn(crypto.subtle, "importKey");

    const first = await readiness(firstEnvironment);
    const second = await readiness(secondEnvironment);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(importKey).toHaveBeenCalledTimes(2);
  });
});
