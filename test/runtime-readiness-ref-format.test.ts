import { describe, expect, it } from "vitest";
import {
  evaluateRuntimeReadiness,
  type RuntimeReadinessEnv,
} from "../src/runtime-readiness";

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

async function readyEnvironment(): Promise<RuntimeReadinessEnv> {
  return {
    ALLOWED_ISSUER: "https://token.actions.githubusercontent.com",
    ALLOWED_AUDIENCE: "cwl-noema-review",
    ALLOWED_REPOSITORY_OWNER: "ContextualWisdomLab",
    ALLOWED_WORKFLOW_REPOSITORY: "ContextualWisdomLab/.github",
    ALLOWED_WORKFLOW_REF_PREFIX:
      "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main",
    ALLOWED_WORKFLOW_SHA: "a".repeat(40),
    GITHUB_API_BASE: "https://api.github.com",
    GITHUB_APP_ID: "123456",
    GITHUB_APP_PRIVATE_KEY_PEM: await privateKeyPem(),
    GITHUB_APP_INSTALLATION_ID: "987654",
    NOEMA_RATE_LIMITER: dummyNamespace(),
    NOEMA_OIDC_REPLAY_GUARD: dummyNamespace(),
  };
}

describe("runtime-readiness exact Git ref validation", () => {
  it.each([
    "refs/heads/release..candidate",
    "refs/heads/release//candidate",
    "refs/heads/.hidden",
    "refs/heads/release/.hidden",
    "refs/tags/release.lock",
    "refs/heads/release.",
  ])("rejects Git-invalid workflow ref %s", async (refName) => {
    const env = await readyEnvironment();
    env.ALLOWED_WORKFLOW_REF_PREFIX =
      `ContextualWisdomLab/.github/.github/workflows/noema-review.yml@${refName}`;

    const result = await evaluateRuntimeReadiness(env);

    expect(result.ready).toBe(false);
    expect(result.failedChecks).toContain("allowed_workflow_ref");
  });

  it("rejects uppercase immutable workflow commit refs as non-canonical authority", async () => {
    const env = await readyEnvironment();
    const uppercaseCommit = "ABCDEF0123456789ABCDEF0123456789ABCDEF01";
    env.ALLOWED_WORKFLOW_REF_PREFIX =
      `ContextualWisdomLab/.github/.github/workflows/noema-review.yml@${uppercaseCommit}`;
    env.ALLOWED_WORKFLOW_SHA = uppercaseCommit.toLowerCase();

    const result = await evaluateRuntimeReadiness(env);

    expect(result.ready).toBe(false);
    expect(result.failedChecks).toContain("allowed_workflow_ref");
  });

  it.each([
    "refs/heads/release/2026.08",
    "refs/tags/v0.2.0",
    "0123456789abcdef0123456789abcdef01234567",
  ])("accepts valid exact workflow ref %s", async (refName) => {
    const env = await readyEnvironment();
    env.ALLOWED_WORKFLOW_REF_PREFIX =
      `ContextualWisdomLab/.github/.github/workflows/noema-review.yml@${refName}`;
    if (/^[0-9a-f]{40}$/.test(refName)) {
      env.ALLOWED_WORKFLOW_SHA = refName;
    }

    const result = await evaluateRuntimeReadiness(env);

    expect(result.ready).toBe(true);
    expect(result.failedChecks).not.toContain("allowed_workflow_ref");
    expect(result.failedChecks).not.toContain("allowed_workflow_sha");
  });
});