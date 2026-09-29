import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../src/index";

// Caller and target owners are not a fixed list: the GitHub App installation is
// the owner's consent, and the exact central workflow ref stays the trust anchor.
const configuredRef =
  "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main";
const configuredWorkflowSha = "a".repeat(40);
const foreignOwner = "HYOSUNG-ITX-AI-Business-Department";
const foreignOwnerId = "900000001";
const foreignRepository = `${foreignOwner}/llm-gateway-console`;

function acceptingReplayGuard(): DurableObjectNamespace {
  return {
    idFromName: (name: string) => ({ toString: () => name }) as DurableObjectId,
    get: () =>
      ({
        fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
          const body = JSON.parse(String(init?.body ?? "{}"));
          return Response.json(
            { accepted: true, expires_at_epoch_seconds: body.expires_at_epoch_seconds },
            { status: 201 },
          );
        },
      }) as unknown as DurableObjectStub,
  } as unknown as DurableObjectNamespace;
}

const baseEnv: Env = {
  ALLOWED_ISSUER: "https://token.actions.githubusercontent.com",
  ALLOWED_AUDIENCE: "cwl-noema-review",
  ALLOWED_REPOSITORY_OWNER: "ContextualWisdomLab",
  ALLOWED_WORKFLOW_REPOSITORY: "ContextualWisdomLab/.github",
  ALLOWED_WORKFLOW_REF_PREFIX: configuredRef,
  ALLOWED_WORKFLOW_SHA: configuredWorkflowSha,
  GITHUB_API_BASE: "https://api.github.com",
  GITHUB_APP_ID: "1",
  GITHUB_APP_PRIVATE_KEY_PEM: "replaced-per-test",
  NOEMA_RATE_LIMIT_PER_MINUTE: "1000",
  NOEMA_OIDC_REPLAY_GUARD: acceptingReplayGuard(),
};

const segment = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

async function rsaKeyPair(): Promise<CryptoKeyPair> {
  return (await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
}

async function signedOidc(claims: Record<string, unknown>) {
  const keys = await rsaKeyPair();
  const kid = `owner-trust-${crypto.randomUUID()}`;
  const now = Math.floor(Date.now() / 1000);
  const header = segment({ alg: "RS256", kid, typ: "JWT" });
  const body = segment({
    iss: baseEnv.ALLOWED_ISSUER,
    aud: baseEnv.ALLOWED_AUDIENCE,
    job_workflow_ref: configuredRef,
    job_workflow_sha: configuredWorkflowSha,
    jti: crypto.randomUUID(),
    exp: now + 300,
    nbf: now - 30,
    iat: now - 30,
    ...claims,
  });
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    keys.privateKey,
    new TextEncoder().encode(`${header}.${body}`),
  );
  const jwk = await crypto.subtle.exportKey("jwk", keys.publicKey);
  return {
    token: `${header}.${body}.${Buffer.from(signature).toString("base64url")}`,
    jwk: { ...jwk, kid, kty: "RSA" },
  };
}

async function appPrivateKeyPem(): Promise<string> {
  const keys = await rsaKeyPair();
  const der = Buffer.from(await crypto.subtle.exportKey("pkcs8", keys.privateKey)).toString("base64");
  return `-----BEGIN PRIVATE KEY-----\n${der.match(/.{1,64}/g)?.join("\n")}\n-----END PRIVATE KEY-----`;
}

type Installation = Record<string, unknown>;

async function exchange(options: {
  claims: Record<string, unknown>;
  target?: string;
  installation: Installation;
  reuseModule?: boolean;
}) {
  if (!options.reuseModule) vi.resetModules();
  const { default: worker } = await import("../src/index");
  const { token, jwk } = await signedOidc(options.claims);
  const target = options.target ?? String(options.claims.repository);
  const expiresAt = new Date(Date.now() + 60 * 60_000).toISOString();
  vi.restoreAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith("/.well-known/openid-configuration")) {
      return Response.json({ jwks_uri: "https://token.actions.githubusercontent.com/.well-known/jwks" });
    }
    if (url.endsWith("/.well-known/jwks")) return Response.json({ keys: [jwk] });
    if (url === `https://api.github.com/repos/${target}/installation`) {
      return Response.json(options.installation);
    }
    if (url === "https://api.github.com/app/installations/777/access_tokens") {
      return Response.json({ token: "ghs_owner_trust", expires_at: expiresAt }, { status: 201 });
    }
    return new Response("unexpected egress", { status: 500 });
  });
  const response = await worker.fetch(
    new Request("https://noema.example/exchange", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "cf-connecting-ip": "203.0.113.77",
      },
      body: JSON.stringify(options.target ? { target_repository: options.target } : {}),
    }),
    { ...baseEnv, GITHUB_APP_PRIVATE_KEY_PEM: await appPrivateKeyPem() },
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

const foreignCaller = {
  repository_owner: foreignOwner,
  repository_owner_id: foreignOwnerId,
  repository: foreignRepository,
  repository_id: "900000002",
  sub: `repo:${foreignRepository}:ref:refs/heads/develop`,
};
const foreignInstallation = { id: 777, account: { id: Number(foreignOwnerId), login: foreignOwner } };

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("installation consent replaces the fixed owner allowlist", () => {
  it("mints for a caller outside ContextualWisdomLab when its owner installed the App", async () => {
    const result = await exchange({ claims: foreignCaller, installation: foreignInstallation });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ ok: true, data: { repository: foreignRepository } });
  });

  it("rejects an installation whose account id differs from the OIDC owner id", async () => {
    const result = await exchange({
      claims: foreignCaller,
      installation: { id: 777, account: { id: 900000099, login: foreignOwner } },
    });
    expect(result.status).toBe(403);
    expect(result.body).toMatchObject({ error_code: "ERR_REPO_NOT_ALLOWED" });
  });

  it("rejects an installation whose account login differs from the target owner", async () => {
    const result = await exchange({
      claims: foreignCaller,
      installation: { id: 777, account: { id: Number(foreignOwnerId), login: "someone-else" } },
    });
    expect(result.status).toBe(403);
    expect(result.body).toMatchObject({ error_code: "ERR_REPO_NOT_ALLOWED" });
  });

  it("fails closed when the installation response has no account", async () => {
    const result = await exchange({ claims: foreignCaller, installation: { id: 777 } });
    expect(result.status).toBe(502);
    expect(result.body).toMatchObject({ ok: false, error_code: "ERR_GITHUB_API" });
  });

  it("still rejects a foreign caller requesting another organization's repository", async () => {
    const result = await exchange({
      claims: foreignCaller,
      target: "ContextualWisdomLab/noema",
      installation: { id: 777, account: { id: 295022177, login: "ContextualWisdomLab" } },
    });
    expect(result.status).toBe(403);
    expect(result.body).toMatchObject({ error_code: "ERR_REPO_NOT_ALLOWED" });
  });

  it("still rejects a foreign caller whose workflow ref is not the central workflow", async () => {
    const result = await exchange({
      claims: {
        ...foreignCaller,
        job_workflow_ref: `${foreignRepository}/.github/workflows/noema-review.yml@refs/heads/main`,
      },
      installation: foreignInstallation,
    });
    expect(result.status).toBe(403);
    expect(result.body).toMatchObject({ error_code: "ERR_WORKFLOW_NOT_ALLOWED" });
  });

  it("re-checks the owner binding on an installation cache hit", async () => {
    const first = await exchange({ claims: foreignCaller, installation: foreignInstallation });
    expect(first.status).toBe(200);
    const second = await exchange({
      claims: { ...foreignCaller, repository_owner_id: "900000099" },
      // A fresh lookup would fail with 502 on this shape; 403 proves the cached binding was re-checked.
      installation: { id: 777 },
      reuseModule: true,
    });
    expect(second.status).toBe(403);
    expect(second.body).toMatchObject({ error_code: "ERR_REPO_NOT_ALLOWED" });
  });

  it("lets the central workflow repository target an organization that installed the App", async () => {
    const result = await exchange({
      claims: {
        repository_owner: "ContextualWisdomLab",
        repository_owner_id: "295022177",
        repository: "ContextualWisdomLab/.github",
        repository_id: "1274066402",
        sub: "repo:ContextualWisdomLab/.github:ref:refs/heads/main",
      },
      target: foreignRepository,
      installation: foreignInstallation,
    });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ ok: true, data: { repository: foreignRepository } });
  });
});
