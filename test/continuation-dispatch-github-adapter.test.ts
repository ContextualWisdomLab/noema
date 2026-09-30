import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  centralContinuationDispatchBody,
  ContinuationGitHubAdapterError,
  dispatchCentralContinuation,
  prepareCentralContinuation,
  readAndVerifyLivePullRequest,
  type ContinuationGitHubAdapterEnv,
} from "../src/continuation-dispatch/github-adapter";
import type { ContinuationDispatchRequest } from "../src/continuation-dispatch/contract";
import type { JwtPayload } from "../src/index";

const SOURCE_REPOSITORY = "ContextualWisdomLab/noema";
const CENTRAL_REPOSITORY = "ContextualWisdomLab/.github";
const HEAD_SHA = "a".repeat(40);
const BASE_SHA = "b".repeat(40);
const BASE_REF = "main";
const SOURCE_TOKEN = "source-installation-token-secret";
const CENTRAL_TOKEN = "central-installation-token-secret";

let appPrivateKeyPem: string;

function pemFromPkcs8(pkcs8: ArrayBuffer): string {
  const base64 = Buffer.from(pkcs8).toString("base64");
  const lines = base64.match(/.{1,64}/g)?.join("\n") ?? base64;
  return `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----`;
}

beforeAll(async () => {
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
  appPrivateKeyPem = pemFromPkcs8(
    await crypto.subtle.exportKey("pkcs8", appKeyPair.privateKey),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function request(overrides: Partial<ContinuationDispatchRequest> = {}): ContinuationDispatchRequest {
  return {
    contract_version: "noema.continuation-dispatch.v1",
    dispatch_action: "noema_review_continuation",
    central_repository: CENTRAL_REPOSITORY,
    source_repository: SOURCE_REPOSITORY,
    pull_request_number: 42,
    expected_head_sha: HEAD_SHA,
    expected_base_sha: BASE_SHA,
    expected_base_ref: BASE_REF,
    transport_retry_attempt: 1,
    ...overrides,
  };
}

function claims(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    repository: SOURCE_REPOSITORY,
    repository_owner: "ContextualWisdomLab",
    ...overrides,
  };
}

function env(): ContinuationGitHubAdapterEnv {
  return {
    GITHUB_API_BASE: "https://api.github.com",
    GITHUB_APP_ID: "101",
    GITHUB_APP_PRIVATE_KEY_PEM: appPrivateKeyPem,
    GITHUB_APP_INSTALLATION_ID: "1001",
    CONTINUATION_DISPATCH_GITHUB_APP_ID: "202",
    CONTINUATION_DISPATCH_GITHUB_APP_PRIVATE_KEY_PEM: appPrivateKeyPem,
    CONTINUATION_DISPATCH_GITHUB_APP_INSTALLATION_ID: "2002",
  };
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function installationToken(token: string): Response {
  return json({ token, expires_at: new Date(Date.now() + 30 * 60_000).toISOString() }, 201);
}

function livePullRequest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    state: "open",
    draft: false,
    head: {
      sha: HEAD_SHA,
      ref: "repair/noema-pr-736-task3",
      repo: { full_name: SOURCE_REPOSITORY },
    },
    base: {
      sha: BASE_SHA,
      ref: BASE_REF,
      repo: { full_name: SOURCE_REPOSITORY },
    },
    ...overrides,
  };
}

function mockSourceRead(pullRequest: Response | (() => Response)): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    expect(init?.redirect).toBe("error");
    if (url === `https://api.github.com/repos/${SOURCE_REPOSITORY}/installation`) {
      return json({ id: 1001 });
    }
    if (url === "https://api.github.com/app/installations/1001/access_tokens") {
      expect(JSON.parse(String(init?.body))).toEqual({
        repositories: ["noema"],
        permissions: { pull_requests: "read" },
      });
      return installationToken(SOURCE_TOKEN);
    }
    if (url === `https://api.github.com/repos/${SOURCE_REPOSITORY}/pulls/42`) {
      expect(init?.method).toBe("GET");
      expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${SOURCE_TOKEN}`);
      return typeof pullRequest === "function" ? pullRequest() : pullRequest;
    }
    return new Response("unexpected request", { status: 500 });
  });
}

describe("live pull request admission", () => {
  it("classifies a missing source App installation as unavailable, not PR stale", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(null, { status: 404 }));

    await expect(readAndVerifyLivePullRequest(claims(), request(), env())).rejects.toMatchObject({
      classification: "upstream_unavailable",
      upstreamStatus: 404,
    });
  });

  it("returns the exact verified live PR identity", async () => {
    mockSourceRead(json(livePullRequest()));

    await expect(readAndVerifyLivePullRequest(claims(), request(), env())).resolves.toEqual({
      repository: SOURCE_REPOSITORY,
      pullRequestNumber: 42,
      headSha: HEAD_SHA,
      baseSha: BASE_SHA,
      baseRef: BASE_REF,
    });
  });

  it("rejects an OIDC repository mismatch before GitHub credential use", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(readAndVerifyLivePullRequest(
      claims({ repository: "ContextualWisdomLab/other" }),
      request(),
      env(),
    )).rejects.toMatchObject({ classification: "identity_denied" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["closed", { state: "closed" }],
    ["draft", { draft: true }],
    ["moved head", { head: { sha: "c".repeat(40), ref: "other", repo: { full_name: SOURCE_REPOSITORY } } }],
    ["fork", { head: { sha: HEAD_SHA, ref: "branch", repo: { full_name: "ContextualWisdomLab/fork" } } }],
    ["wrong base repository", { base: { sha: BASE_SHA, ref: BASE_REF, repo: { full_name: "ContextualWisdomLab/other" } } }],
    ["wrong base sha", { base: { sha: "d".repeat(40), ref: BASE_REF, repo: { full_name: SOURCE_REPOSITORY } } }],
    ["wrong base ref", { base: { sha: BASE_SHA, ref: "release", repo: { full_name: SOURCE_REPOSITORY } } }],
  ])("rejects a %s PR as stale", async (_label, override) => {
    mockSourceRead(json(livePullRequest(override)));
    await expect(readAndVerifyLivePullRequest(claims(), request(), env())).rejects.toMatchObject({
      classification: "live_state_stale",
    });
  });

  it.each([
    [403, "identity_denied"],
    [404, "live_state_stale"],
    [422, "live_state_stale"],
    [500, "upstream_unavailable"],
  ] as const)("classifies GitHub PR status %i as %s", async (status, classification) => {
    mockSourceRead(new Response(null, { status }));
    await expect(readAndVerifyLivePullRequest(claims(), request(), env())).rejects.toMatchObject({
      classification,
      upstreamStatus: status,
    });
  });

  it("classifies a GitHub PR network failure without leaking credentials", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    mockSourceRead(() => {
      throw new Error(`network failed near ${SOURCE_TOKEN}`);
    });

    let failure: unknown;
    try {
      await readAndVerifyLivePullRequest(claims(), request(), env());
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(ContinuationGitHubAdapterError);
    expect(failure).toMatchObject({ classification: "upstream_unavailable" });
    expect(String(failure)).not.toContain(SOURCE_TOKEN);
    expect(logSpy.mock.calls.flat().join("\n")).not.toContain(SOURCE_TOKEN);
  });
});

function mockCentralDispatch(dispatchResponse: Response | (() => Response)): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    expect(init?.redirect).toBe("error");
    if (url === `https://api.github.com/repos/${CENTRAL_REPOSITORY}/installation`) {
      return json({ id: 2002 });
    }
    if (url === "https://api.github.com/app/installations/2002/access_tokens") {
      expect(JSON.parse(String(init?.body))).toEqual({
        repositories: [".github"],
        permissions: { contents: "write" },
      });
      return installationToken(CENTRAL_TOKEN);
    }
    if (url === `https://api.github.com/repos/${CENTRAL_REPOSITORY}/dispatches`) {
      expect(init?.method).toBe("POST");
      expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${CENTRAL_TOKEN}`);
      expect(init?.body).toBe(centralContinuationDispatchBody(request()));
      expect(JSON.parse(String(init?.body))).toEqual({
        event_type: "noema-review",
        client_payload: {
          source_repository: SOURCE_REPOSITORY,
          pull_request_number: 42,
          expected_head_sha: HEAD_SHA,
          expected_base_sha: BASE_SHA,
          expected_base_ref: BASE_REF,
          transport_retry_attempt: 1,
        },
      });
      return typeof dispatchResponse === "function" ? dispatchResponse() : dispatchResponse;
    }
    return new Response("unexpected request", { status: 500 });
  });
}

describe("fixed central dispatch", () => {
  it("prepares the central credential before the external dispatch can begin", async () => {
    const fetchSpy = mockCentralDispatch(new Response(null, { status: 204 }));

    const prepared = await prepareCentralContinuation(env());

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    await expect(prepared.send(request())).resolves.toEqual({
      outcome: "accepted",
      upstreamStatus: 204,
      eventType: "noema-review",
    });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("classifies a missing central App installation as unavailable, never source-PR stale", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      expect(init?.redirect).toBe("error");
      const url = String(input);
      if (url === `https://api.github.com/repos/${CENTRAL_REPOSITORY}/installation`) {
        return json({ id: 2002 });
      }
      if (url === "https://api.github.com/app/installations/2002/access_tokens") {
        return new Response(null, { status: 404 });
      }
      return new Response("unexpected request", { status: 500 });
    });

    await expect(dispatchCentralContinuation(request(), env())).rejects.toMatchObject({
      classification: "upstream_unavailable",
      upstreamStatus: 404,
    });
  });

  it("sanitizes a central App installation-token network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === `https://api.github.com/repos/${CENTRAL_REPOSITORY}/installation`) {
        return json({ id: 2002 });
      }
      if (url === "https://api.github.com/app/installations/2002/access_tokens") {
        throw new Error(`network failed near ${CENTRAL_TOKEN}`);
      }
      return new Response("unexpected request", { status: 500 });
    });

    let failure: unknown;
    try {
      await dispatchCentralContinuation(request(), env());
    } catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({ classification: "upstream_unavailable" });
    expect(String(failure)).not.toContain(CENTRAL_TOKEN);
  });

  it("uses only the fixed repository, path, event, payload, and central App", async () => {
    const fetchSpy = mockCentralDispatch(new Response(null, { status: 204 }));

    await expect(dispatchCentralContinuation(request(), env())).resolves.toEqual({
      outcome: "accepted",
      upstreamStatus: 204,
      eventType: "noema-review",
    });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("fails the opaque prepared capability closed at its exact installation-token expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01T00:00:00.000Z"));
    const fetchSpy = mockCentralDispatch(new Response(null, { status: 204 }));
    const prepared = await prepareCentralContinuation(env());
    vi.setSystemTime(new Date("2030-01-01T00:30:00.000Z"));

    expect(() => prepared.assertFresh()).toThrow(ContinuationGitHubAdapterError);
    await expect(prepared.send(request())).rejects.toMatchObject({
      name: "ContinuationDispatchNotStartedError",
      classification: "upstream_unavailable",
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("maps the released Strix action without caller-selected dispatch authority", async () => {
    mockCentralDispatch(new Response(null, { status: 204 })).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/installation")) return json({ id: 2002 });
      if (url.endsWith("/access_tokens")) return installationToken(CENTRAL_TOKEN);
      expect(JSON.parse(String(init?.body))).toMatchObject({ event_type: "strix-scan" });
      return new Response(null, { status: 204 });
    });

    await expect(dispatchCentralContinuation(
      request({ dispatch_action: "strix_scan_continuation" }),
      env(),
    )).resolves.toMatchObject({ outcome: "accepted", eventType: "strix-scan" });
  });

  it.each([403, 404, 422] as const)("persists GitHub dispatch status %i as denied", async (status) => {
    mockCentralDispatch(new Response(null, { status }));
    await expect(dispatchCentralContinuation(request(), env())).resolves.toEqual({
      outcome: "denied",
      upstreamStatus: status,
      eventType: "noema-review",
    });
  });

  it("persists GitHub dispatch 5xx as indeterminate", async () => {
    mockCentralDispatch(new Response(null, { status: 503 }));
    await expect(dispatchCentralContinuation(request(), env())).resolves.toEqual({
      outcome: "indeterminate",
      upstreamStatus: 503,
      eventType: "noema-review",
    });
  });

  it("persists redirect denial or another dispatch network failure as indeterminate without leaking its token", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockCentralDispatch(() => {
      throw new TypeError(`redirect blocked for ${CENTRAL_TOKEN}`);
    });

    const result = await dispatchCentralContinuation(request(), env());
    expect(result).toEqual({
      outcome: "indeterminate",
      eventType: "noema-review",
    });
    expect(JSON.stringify(result)).not.toContain(CENTRAL_TOKEN);
    expect(errorSpy.mock.calls.flat().join("\n")).not.toContain(CENTRAL_TOKEN);
  });
});
