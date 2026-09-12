import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../src/index";

const configuredWorkflowRef =
  "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main";
const trustedDiscoveryUrl =
  "https://token.actions.githubusercontent.com/.well-known/openid-configuration";
const trustedJwksUrl = "https://token.actions.githubusercontent.com/.well-known/jwks";

const env: Env = {
  ALLOWED_ISSUER: "https://token.actions.githubusercontent.com",
  ALLOWED_AUDIENCE: "cwl-noema-review",
  ALLOWED_REPOSITORY_OWNER: "ContextualWisdomLab",
  ALLOWED_WORKFLOW_REPOSITORY: "ContextualWisdomLab/.github",
  ALLOWED_WORKFLOW_REF_PREFIX: configuredWorkflowRef,
  ALLOWED_WORKFLOW_SHA: "a".repeat(40),
  GITHUB_API_BASE: "https://api.github.com",
  GITHUB_APP_ID: "1",
  GITHUB_APP_PRIVATE_KEY_PEM: "unused",
  NOEMA_RATE_LIMIT_PER_MINUTE: "1000",
};

function encodeSegment(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
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
});
