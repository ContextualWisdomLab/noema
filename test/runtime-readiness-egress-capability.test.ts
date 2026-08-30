import { describe, expect, it, vi } from "vitest";

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
    ALLOWED_WORKFLOW_SHA: "0123456789abcdef0123456789abcdef01234567",
    GITHUB_API_BASE: "https://api.github.com",
    GITHUB_APP_ID: "123456",
    GITHUB_APP_PRIVATE_KEY_PEM: await privateKeyPem(),
    GITHUB_APP_INSTALLATION_ID: "987654",
    NOEMA_RATE_LIMIT_PER_MINUTE: "60",
    NOEMA_RATE_LIMITER: dummyNamespace(),
    NOEMA_OIDC_REPLAY_GUARD: dummyNamespace(),
  };
}

describe("Noema runtime readiness credential-egress capability", () => {
  it("fails closed when the runtime cannot provide the fetch capability required by credential exchange", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, "fetch");
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: undefined,
    });

    try {
      const response = await entrypoint.fetch(
        new Request("https://noema.example/ready"),
        await readyEnv(),
      );

      expect(response.status).toBe(503);
      expect(response.headers.get("x-noema-readiness")).toBe("not-ready");
      await expect(response.json()).resolves.toMatchObject({
        ok: false,
        error_code: "ERR_SERVICE_NOT_READY",
        details: {
          failed_checks: "credential_fetch_capability",
        },
      });
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(globalThis, "fetch", originalDescriptor);
      } else {
        Reflect.deleteProperty(globalThis, "fetch");
      }
      vi.restoreAllMocks();
    }
  });

  it("fails closed when fetch is callable but the runtime cannot install the credential-egress wrapper", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, "fetch");
    const currentFetch = globalThis.fetch;
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: false,
      value: currentFetch,
    });

    try {
      const response = await entrypoint.fetch(
        new Request("https://noema.example/ready"),
        await readyEnv(),
      );

      expect(response.status).toBe(503);
      expect(response.headers.get("x-noema-readiness")).toBe("not-ready");
      await expect(response.json()).resolves.toMatchObject({
        ok: false,
        error_code: "ERR_SERVICE_NOT_READY",
        details: {
          failed_checks: "credential_fetch_capability",
        },
      });
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(globalThis, "fetch", originalDescriptor);
      } else {
        Reflect.deleteProperty(globalThis, "fetch");
      }
      vi.restoreAllMocks();
    }
  });
});
