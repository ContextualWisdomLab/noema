import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../src/index";

const configuredWorkflowRef =
  "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main";
const configuredWorkflowSha = "a".repeat(40);
const trustedDiscoveryUrl =
  "https://token.actions.githubusercontent.com/.well-known/openid-configuration";
const trustedJwksUrl = "https://token.actions.githubusercontent.com/.well-known/jwks";
const expectedRepositoryOwnerId = "295022177";
const expectedWorkflowRepositoryId = "1274066402";

function namespaceReturning(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): DurableObjectNamespace {
  return {
    idFromName(name: string) {
      return { toString: () => name } as DurableObjectId;
    },
    get() {
      return { fetch: handler } as unknown as DurableObjectStub;
    },
  } as unknown as DurableObjectNamespace;
}

function acceptingReplayGuard(): DurableObjectNamespace {
  return namespaceReturning(async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    return Response.json(
      { accepted: true, expires_at_epoch_seconds: body.expires_at_epoch_seconds },
      { status: 201 },
    );
  });
}

const env: Env = {
  ALLOWED_ISSUER: "https://token.actions.githubusercontent.com",
  ALLOWED_AUDIENCE: "cwl-noema-review",
  ALLOWED_REPOSITORY_OWNER: "ContextualWisdomLab",
  ALLOWED_WORKFLOW_REPOSITORY: "ContextualWisdomLab/.github",
  ALLOWED_WORKFLOW_REF_PREFIX: configuredWorkflowRef,
  ALLOWED_WORKFLOW_SHA: configuredWorkflowSha,
  GITHUB_API_BASE: "https://api.github.com",
  GITHUB_APP_ID: "1",
  GITHUB_APP_PRIVATE_KEY_PEM: "unused",
  NOEMA_RATE_LIMIT_PER_MINUTE: "1000",
};

function encodeSegment(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function encodeBytes(bytes: ArrayBuffer): string {
  return Buffer.from(bytes).toString("base64url");
}

function pemFromPkcs8(pkcs8: ArrayBuffer): string {
  const base64 = Buffer.from(pkcs8).toString("base64");
  const lines = base64.match(/.{1,64}/g)?.join("\n") ?? base64;
  return `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----`;
}

function structurallyValidJwt(): string {
  const now = Math.floor(Date.now() / 1000);
  return [
    encodeSegment({ alg: "RS256", kid: "external-json-locked-reader" }),
    encodeSegment({
      iss: env.ALLOWED_ISSUER,
      aud: env.ALLOWED_AUDIENCE,
      repository_owner: env.ALLOWED_REPOSITORY_OWNER,
      repository: "ContextualWisdomLab/.github",
      job_workflow_ref: configuredWorkflowRef,
      exp: now + 300,
      nbf: now - 30,
      iat: now - 30,
    }),
    "AA",
  ].join(".");
}

async function createSignedJwt(payload: Record<string, unknown>) {
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
  const kid = `external-json-locked-reader-${crypto.randomUUID()}`;
  const header = encodeSegment({ alg: "RS256", kid, typ: "JWT" });
  const body = encodeSegment(payload);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    keyPair.privateKey,
    new TextEncoder().encode(`${header}.${body}`),
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  return {
    token: `${header}.${body}.${encodeBytes(signature)}`,
    jwk: { ...publicJwk, kid, kty: "RSA" },
  };
}

async function exchangeWithFetch(
  implementation: (input: RequestInfo | URL) => Promise<Response>,
): Promise<Response> {
  vi.resetModules();
  const { default: worker } = await import("../src/index");
  vi.spyOn(globalThis, "fetch").mockImplementation(implementation);
  return worker.fetch(
    new Request("https://noema.example/exchange", {
      method: "POST",
      headers: { authorization: `Bearer ${structurallyValidJwt()}` },
    }),
    env,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("external JSON response reader acquisition", () => {
  it("classifies a locked OIDC discovery body as a transport read failure", async () => {
    let heldReader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let jwksFetches = 0;
    try {
      const response = await exchangeWithFetch(async (input) => {
        const url = String(input);
        if (url === trustedDiscoveryUrl) {
          const discovery = Response.json({ jwks_uri: trustedJwksUrl });
          heldReader = discovery.body!.getReader();
          return discovery;
        }
        if (url === trustedJwksUrl) jwksFetches += 1;
        return new Response("unexpected privileged egress", { status: 500 });
      });

      expect(response.status).toBe(502);
      expect(jwksFetches).toBe(0);
      await expect(response.json()).resolves.toMatchObject({
        ok: false,
        error_code: "ERR_OIDC_VERIFICATION",
        message: "GitHub OIDC discovery response body could not be read",
      });
    } finally {
      heldReader?.releaseLock();
    }
  });

  it("classifies a locked OIDC JWKS body as a transport read failure", async () => {
    let heldReader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const response = await exchangeWithFetch(async (input) => {
        const url = String(input);
        if (url === trustedDiscoveryUrl) {
          return Response.json({ jwks_uri: trustedJwksUrl });
        }
        if (url === trustedJwksUrl) {
          const jwks = Response.json({ keys: [] });
          heldReader = jwks.body!.getReader();
          return jwks;
        }
        return new Response("unexpected privileged egress", { status: 500 });
      });

      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toMatchObject({
        ok: false,
        error_code: "ERR_OIDC_VERIFICATION",
        message: "GitHub OIDC JWKS response body could not be read",
      });
    } finally {
      heldReader?.releaseLock();
    }
  });

  it("classifies a locked GitHub API body as a transport read failure", async () => {
    const now = Math.floor(Date.now() / 1000);
    const { token: oidcToken, jwk } = await createSignedJwt({
      iss: env.ALLOWED_ISSUER,
      aud: env.ALLOWED_AUDIENCE,
      repository_owner: env.ALLOWED_REPOSITORY_OWNER,
      repository_owner_id: expectedRepositoryOwnerId,
      repository: "ContextualWisdomLab/.github",
      repository_id: expectedWorkflowRepositoryId,
      workflow_ref: configuredWorkflowRef,
      workflow_sha: configuredWorkflowSha,
      sub: "repo:ContextualWisdomLab/.github:ref:refs/heads/main",
      jti: crypto.randomUUID(),
      exp: now + 300,
      nbf: now - 30,
      iat: now - 30,
    });
    const appKeyPair = await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"],
    );
    const appPrivateKey = pemFromPkcs8(
      await crypto.subtle.exportKey("pkcs8", appKeyPair.privateKey),
    );
    let heldReader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      vi.resetModules();
      const { default: worker } = await import("../src/index");
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url === trustedDiscoveryUrl) {
          return Response.json({ jwks_uri: trustedJwksUrl });
        }
        if (url === trustedJwksUrl) {
          return Response.json({ keys: [jwk] });
        }
        if (url === "https://api.github.com/repos/ContextualWisdomLab/noema/installation") {
          const installation = Response.json({ id: 12345 });
          heldReader = installation.body!.getReader();
          return installation;
        }
        return new Response("unexpected privileged egress", { status: 500 });
      });

      const response = await worker.fetch(
        new Request("https://noema.example/exchange", {
          method: "POST",
          headers: {
            authorization: `Bearer ${oidcToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ target_repository: "ContextualWisdomLab/noema" }),
        }),
        {
          ...env,
          GITHUB_APP_PRIVATE_KEY_PEM: appPrivateKey,
          NOEMA_OIDC_REPLAY_GUARD: acceptingReplayGuard(),
        },
      );

      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toMatchObject({
        ok: false,
        error_code: "ERR_GITHUB_API",
        message: "GitHub API response body could not be read",
      });
    } finally {
      heldReader?.releaseLock();
    }
  });
});
