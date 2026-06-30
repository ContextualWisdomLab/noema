export interface Env {
  ALLOWED_ISSUER: string;
  ALLOWED_AUDIENCE: string;
  ALLOWED_REPOSITORY_OWNER: string;
  ALLOWED_WORKFLOW_REPOSITORY: string;
  ALLOWED_WORKFLOW_REF_PREFIX: string;
  GITHUB_API_BASE: string;
  GITHUB_APP_ID: string;
  GITHUB_APP_PRIVATE_KEY_PEM: string;
  GITHUB_APP_INSTALLATION_ID?: string;
}

type JwtPayload = {
  iss?: string;
  aud?: string | string[];
  repository?: string;
  repository_owner?: string;
  workflow_ref?: string;
  job_workflow_ref?: string;
  ref?: string;
  exp?: number;
  nbf?: number;
  iat?: number;
};

type ExchangeRequestBody = {
  target_repository?: string;
};

type JsonWebKeySet = {
  keys: Array<JsonWebKey & { kid?: string; kty?: string }>;
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function base64UrlDecode(input: string): Uint8Array<ArrayBuffer> {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function base64UrlEncode(bytes: ArrayBuffer | Uint8Array<ArrayBufferLike>): string {
  const array = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of array) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeJson<T>(segment: string): T {
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(segment))) as T;
}

async function fetchGithubOidcKeys(): Promise<JsonWebKeySet> {
  const discovery = await fetch("https://token.actions.githubusercontent.com/.well-known/openid-configuration");
  if (!discovery.ok) throw new Error("failed to fetch GitHub OIDC discovery document");
  const { jwks_uri: jwksUri } = (await discovery.json()) as { jwks_uri?: string };
  if (!jwksUri) throw new Error("GitHub OIDC discovery document did not include jwks_uri");
  const keys = await fetch(jwksUri);
  if (!keys.ok) throw new Error("failed to fetch GitHub OIDC JWKS");
  return (await keys.json()) as JsonWebKeySet;
}

async function verifyGithubOidcJwt(token: string, env: Env): Promise<JwtPayload> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("OIDC token is not a JWT");
  const header = decodeJson<{ kid?: string; alg?: string }>(parts[0]);
  const payload = decodeJson<JwtPayload>(parts[1]);
  if (header.alg !== "RS256" || !header.kid) throw new Error("OIDC token header is not acceptable");

  const jwks = await fetchGithubOidcKeys();
  const jwk = jwks.keys.find((key) => key.kid === header.kid && key.kty === "RSA");
  if (!jwk) throw new Error("OIDC signing key was not found");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const signature = base64UrlDecode(parts[2]);
  const verified = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, signed);
  if (!verified) throw new Error("OIDC signature verification failed");

  const now = Math.floor(Date.now() / 1000);
  if (payload.iss !== env.ALLOWED_ISSUER) throw new Error("OIDC issuer is not allowed");
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(env.ALLOWED_AUDIENCE)) throw new Error("OIDC audience is not allowed");
  if (payload.repository_owner !== env.ALLOWED_REPOSITORY_OWNER) throw new Error("OIDC repository owner is not allowed");
  const workflowRef = payload.job_workflow_ref || payload.workflow_ref || "";
  if (!workflowRef.startsWith(env.ALLOWED_WORKFLOW_REF_PREFIX)) throw new Error("OIDC workflow_ref is not allowed");
  if (!workflowRef.startsWith(`${env.ALLOWED_WORKFLOW_REPOSITORY}/.github/workflows/`)) {
    throw new Error("OIDC workflow repository is not allowed");
  }
  if (typeof payload.nbf === "number" && payload.nbf > now + 30) throw new Error("OIDC token is not valid yet");
  if (typeof payload.exp !== "number" || payload.exp < now - 30) throw new Error("OIDC token is expired");
  return payload;
}

function validateRepositoryName(repository: string, env: Env): string {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error("target_repository is not a valid owner/name repository");
  }
  const [owner] = repository.split("/", 1);
  if (owner !== env.ALLOWED_REPOSITORY_OWNER) throw new Error("target_repository owner is not allowed");
  return repository;
}

async function importGithubAppPrivateKey(pem: string): Promise<CryptoKey> {
  const body = pem.replace(/-----BEGIN [^-]+-----/g, "").replace(/-----END [^-]+-----/g, "").replace(/\s+/g, "");
  const der = base64UrlDecode(body.replace(/\+/g, "-").replace(/\//g, "_"));
  return crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
}

async function createGitHubAppJwt(env: Env): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ iat: now - 60, exp: now + 540, iss: env.GITHUB_APP_ID })));
  const key = await importGithubAppPrivateKey(env.GITHUB_APP_PRIVATE_KEY_PEM);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${payload}`));
  return `${header}.${payload}.${base64UrlEncode(signature)}`;
}

async function githubJson(path: string, init: RequestInit, env: Env): Promise<any> {
  const response = await fetch(`${env.GITHUB_API_BASE}${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": "noema",
      "x-github-api-version": "2022-11-28",
      ...(init.headers || {}),
    },
  });
  if (!response.ok) throw new Error(`GitHub API ${path} failed with ${response.status}: ${await response.text()}`);
  return response.json();
}

async function resolveInstallationId(appJwt: string, repository: string, env: Env): Promise<string> {
  if (env.GITHUB_APP_INSTALLATION_ID) return env.GITHUB_APP_INSTALLATION_ID;
  const installation = await githubJson(`/repos/${repository}/installation`, {
    headers: { authorization: `Bearer ${appJwt}` },
  }, env);
  if (!installation.id) throw new Error("GitHub App installation id was not found");
  return String(installation.id);
}

async function createInstallationToken(repository: string, env: Env): Promise<string> {
  const appJwt = await createGitHubAppJwt(env);
  const installationId = await resolveInstallationId(appJwt, repository, env);
  const token = await githubJson(`/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    headers: { authorization: `Bearer ${appJwt}` },
    body: JSON.stringify({ repositories: [repository.split("/", 2)[1]], permissions: { pull_requests: "write", contents: "read", checks: "read" } }),
  }, env);
  if (!token.token) throw new Error("GitHub installation token response was empty");
  return String(token.token);
}

async function parseExchangeRequestBody(request: Request): Promise<ExchangeRequestBody> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) return {};
  const body = await request.json();
  if (!body || typeof body !== "object") return {};
  return body as ExchangeRequestBody;
}

async function createRepositoryInstallationToken(request: Request, claims: JwtPayload, env: Env): Promise<{ repository: string; token: string }> {
  const body = await parseExchangeRequestBody(request);
  const requestedRepository = String(body.target_repository || claims.repository || "").trim();
  const repository = validateRepositoryName(requestedRepository, env);
  if (claims.repository !== repository && claims.repository !== env.ALLOWED_WORKFLOW_REPOSITORY) {
    throw new Error("OIDC repository cannot request token for target_repository");
  }
  const token = await createInstallationToken(repository, env);
  return { repository, token };
}
async function handleExchange(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return jsonResponse({ error: "missing_bearer_token" }, 401);
  const claims = await verifyGithubOidcJwt(match[1], env);
  const { repository, token } = await createRepositoryInstallationToken(request, claims, env);
  return jsonResponse({ token, repository, workflow_ref: claims.job_workflow_ref || claims.workflow_ref });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (url.pathname === "/health") return jsonResponse({ ok: true, name: "noema" });
      if (url.pathname === "/exchange") return handleExchange(request, env);
      return jsonResponse({ error: "not_found" }, 404);
    } catch (error) {
      return jsonResponse({ error: "exchange_failed", message: error instanceof Error ? error.message : String(error) }, 400);
    }
  },
};
