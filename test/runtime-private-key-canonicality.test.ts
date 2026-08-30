import { describe, expect, it, vi } from "vitest";
import { normalizeGitHubAppPrivateKeyPem } from "../src/github-app-private-key";
import runtimeWorker, { type Env as RuntimeEnv } from "../src/runtime-entrypoint";

const configuredRef =
  "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main";
const configuredWorkflowSha = "a".repeat(40);

async function generateRsaKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
}

function pemFromPkcs8(pkcs8: ArrayBuffer): string {
  const base64 = Buffer.from(pkcs8).toString("base64");
  const lines = base64.match(/.{1,64}/g)?.join("\n") ?? base64;
  return `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----`;
}

function bareCrBodyAlias(pem: string): string {
  const lines = pem.split("\n");
  if (lines.length < 4) throw new Error("test key did not contain multiple PEM body lines");
  return [lines[0], `${lines[1]}\r${lines[2]}`, ...lines.slice(3)].join("\n");
}

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
    ALLOWED_WORKFLOW_REF_PREFIX: configuredRef,
    ALLOWED_WORKFLOW_SHA: configuredWorkflowSha,
    GITHUB_API_BASE: "https://api.github.com",
    GITHUB_APP_ID: "1",
    GITHUB_APP_PRIVATE_KEY_PEM: privateKeyPem,
    NOEMA_RATE_LIMIT_PER_MINUTE: "1000",
    NOEMA_RATE_LIMITER: namespace,
    NOEMA_OIDC_REPLAY_GUARD: namespace,
  };
}

describe("runtime GitHub App private-key canonical authority", () => {
  it("fails readiness closed when the canonicalizer rejects a bare-CR PKCS#8 body alias", async () => {
    const keyPair = await generateRsaKeyPair();
    const pkcs8 = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
    const canonicalPem = pemFromPkcs8(pkcs8);
    const aliasedPem = bareCrBodyAlias(canonicalPem);

    expect(normalizeGitHubAppPrivateKeyPem(aliasedPem)).toBeUndefined();

    const response = await runtimeWorker.fetch(
      new Request("https://noema.example/ready"),
      readinessEnv(aliasedPem),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_SERVICE_NOT_READY",
      details: {
        failed_checks: expect.stringContaining("github_app_private_key"),
      },
    });
  });
});
