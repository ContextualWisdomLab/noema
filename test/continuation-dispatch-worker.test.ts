import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import baseWorker from "../src/index";
import runtimeWorker from "../src/runtime-entrypoint";
import protectedWorker from "../src/worker";
import {
  handleContinuationDispatch,
  type ContinuationDispatchHandlerDependencies,
} from "../src/continuation-dispatch/handler";
import {
  ContinuationDispatchStateConflict,
  ContinuationDispatchStateUnavailable,
} from "../src/continuation-dispatch/dispatch-state";
import { ContinuationGitHubAdapterError } from "../src/continuation-dispatch/github-adapter";
import { verifyContinuationReceipt } from "../src/continuation-dispatch/receipt";

const workflowSha = "1".repeat(40);
const headSha = "2".repeat(40);
const baseSha = "3".repeat(40);
const workflowRef = "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main";
const testJwt = [
  Buffer.from(JSON.stringify({ alg: "RS256", kid: "task-5" })).toString("base64url"),
  Buffer.from(JSON.stringify({ sub: "task-5" })).toString("base64url"),
  Buffer.from([0]).toString("base64url"),
].join(".");
const requestBody = {
  contract_version: "noema.continuation-dispatch.v1",
  dispatch_action: "noema_review_continuation",
  central_repository: "ContextualWisdomLab/.github",
  source_repository: "ContextualWisdomLab/noema",
  pull_request_number: 736,
  expected_head_sha: headSha,
  expected_base_sha: baseSha,
  expected_base_ref: "main",
  transport_retry_attempt: 1,
} as const;

let signingPrivateKeyPem = "";
let signingPublicKeyPem = "";

function pem(label: "PRIVATE KEY" | "PUBLIC KEY", bytes: ArrayBuffer): string {
  const base64 = Buffer.from(bytes).toString("base64");
  return `-----BEGIN ${label}-----\n${base64.match(/.{1,64}/g)?.join("\n")}\n-----END ${label}-----`;
}

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
  signingPrivateKeyPem = pem("PRIVATE KEY", await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  signingPublicKeyPem = pem("PUBLIC KEY", await crypto.subtle.exportKey("spki", pair.publicKey));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function request(body: string = JSON.stringify(requestBody), init: RequestInit = {}): Request {
  return new Request("https://noema.example/v1/continuation-dispatches", {
    method: "POST",
    headers: {
      authorization: `Bearer ${testJwt}`,
      "content-type": "application/json",
      "x-request-id": "trace-task-5",
      ...(init.headers ?? {}),
    },
    body,
    ...init,
  });
}

function harness() {
  const calls: string[] = [];
  let retained: Record<string, unknown> | undefined;
  const reservation = {
    kind: "reserved" as const,
    identity: "a".repeat(64),
    digest: "a".repeat(64),
    reservationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  };
  const dependencies: ContinuationDispatchHandlerDependencies = {
    verifyOidc: async () => ({
      repository: requestBody.source_repository,
      job_workflow_ref: workflowRef,
      job_workflow_sha: workflowSha,
      iat: 1_800_000_000,
      exp: 1_800_000_300,
      jti: "task-5-jti",
    }),
    claimOidc: async () => {
      calls.push("claim");
      return true;
    },
    readLivePullRequest: async () => {
      calls.push("live-pr");
      return {
        repository: requestBody.source_repository,
        pullRequestNumber: requestBody.pull_request_number,
        headSha,
        baseSha,
        baseRef: "main",
      };
    },
    reserve: async (_env, identity, digest) => {
      calls.push("reserve");
      if (retained !== undefined) {
        return {
          kind: "replay" as const,
          identity,
          digest,
          outcome: "accepted" as const,
          receipt: retained,
        };
      }
      return { ...reservation, identity, digest };
    },
    prepareDispatch: async () => {
      calls.push("prepare-dispatch");
      return { send: async () => ({ outcome: "accepted", upstreamStatus: 204, eventType: "noema-review" }) };
    },
    dispatch: async () => {
      calls.push("dispatch");
      return { outcome: "accepted" as const, upstreamStatus: 204, eventType: "noema-review" as const };
    },
    commit: async (_env, _reservation, receipt) => {
      calls.push("commit");
      retained = receipt;
    },
    abort: async () => {
      calls.push("abort");
    },
    finalize: async (_env, _reservation, receipt) => {
      calls.push("finalize");
      retained = receipt;
    },
  };
  const env = {
    ALLOWED_WORKFLOW_SHA: workflowSha,
    CONTINUATION_RECEIPT_SIGNING_PRIVATE_KEY_PEM: signingPrivateKeyPem,
    CONTINUATION_RECEIPT_SIGNING_KEY_ID: "noema-continuation-2026-09",
  } as never;
  return { calls, dependencies, env };
}

describe("continuation dispatch public route", () => {
  it("applies the distributed rate limit before dispatch authentication", async () => {
    const limiterFetch = vi.fn(async () => Response.json({
      allowed: false,
      limit: 60,
      remaining: 0,
      retry_after_seconds: 37,
    }));
    const limiter = {
      idFromName: () => ({ toString: () => "continuation-client" }) as DurableObjectId,
      get: () => ({ fetch: limiterFetch }) as unknown as DurableObjectStub,
    } as unknown as DurableObjectNamespace;

    const response = await protectedWorker.fetch(
      request(JSON.stringify(requestBody), {
        headers: {
          authorization: "Bearer invalid",
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.20",
        },
      }),
      {
        NOEMA_RATE_LIMITER: limiter,
        NOEMA_RATE_LIMIT_PER_MINUTE: "60",
      } as never,
    );

    expect(limiterFetch).toHaveBeenCalledOnce();
    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_RATE_LIMIT",
    });
  });

  it("rejects query authority on the exact public resource before runtime configuration", async () => {
    const response = await runtimeWorker.fetch(
      new Request("https://noema.example/v1/continuation-dispatches?authority=attacker"),
      {} as never,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_DISPATCH_REQUEST_INVALID",
    });
  });

  it("is admitted by the base worker instead of falling through to 404", async () => {
    const response = await baseWorker.fetch(
      new Request("https://noema.example/v1/continuation-dispatches"),
      {} as never,
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_DISPATCH_REQUEST_INVALID",
    });
  });

  it("verifies, claims, checks live state, dispatches once, commits, and returns a verifiable receipt", async () => {
    const { calls, dependencies, env } = harness();
    const response = await handleContinuationDispatch(request(), env, "trace-task-5", dependencies);
    const payload = await response.json() as { ok: true; data: { receipt: unknown }; trace_id: string };

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-trace-id")).toBe("trace-task-5");
    expect(response.headers.get("x-oidc-replay-protection")).toBe("verified-before-dispatch");
    expect(payload.ok).toBe(true);
    expect(payload.trace_id).toBe("trace-task-5");
    expect(calls).toEqual([
      "claim",
      "reserve",
      "live-pr",
      "prepare-dispatch",
      "commit",
      "dispatch",
      "finalize",
    ]);
    await expect(verifyContinuationReceipt(payload.data.receipt, signingPublicKeyPem)).resolves.toBe(true);
    expect(JSON.stringify(payload)).not.toMatch(/token|bearer|assertion|private_key/i);
  });

  it("accepts the workflow_ref fallback and emits the fixed Strix event identity", async () => {
    const { calls, dependencies, env } = harness();
    dependencies.verifyOidc = async () => ({
      repository: requestBody.source_repository,
      workflow_ref: workflowRef,
      workflow_sha: workflowSha,
      iat: 1_800_000_000,
      exp: 1_800_000_300,
      jti: "task-5-strix-jti",
    });
    dependencies.dispatch = async (candidate) => {
      calls.push("dispatch");
      expect(candidate.dispatch_action).toBe("strix_scan_continuation");
      return { outcome: "accepted", upstreamStatus: 204, eventType: "strix-scan" };
    };

    const response = await handleContinuationDispatch(request(JSON.stringify({
      ...requestBody,
      dispatch_action: "strix_scan_continuation",
    })), env, "trace-task-5", dependencies);

    expect(response.status).toBe(200);
    expect(calls).toEqual([
      "claim",
      "reserve",
      "live-pr",
      "prepare-dispatch",
      "commit",
      "dispatch",
      "finalize",
    ]);
  });

  it("returns the exact retained receipt on replay without a second dispatch", async () => {
    const { calls, dependencies, env } = harness();
    const first = await handleContinuationDispatch(request(), env, "trace-task-5", dependencies);
    const firstPayload = await first.json() as { data: { receipt: unknown } };
    const second = await handleContinuationDispatch(request(), env, "trace-task-5", dependencies);
    const secondPayload = await second.json() as { data: { receipt: unknown } };

    expect(second.status).toBe(200);
    expect(second.headers.get("x-continuation-replay")).toBe("exact");
    expect(secondPayload.data.receipt).toEqual(firstPayload.data.receipt);
    expect(calls.filter((call) => call === "dispatch")).toHaveLength(1);
    expect(calls.filter((call) => call === "live-pr")).toHaveLength(1);
  });

  it.each([
    ["denied", 502, "ERR_GITHUB_DISPATCH_AUTHORIZATION"],
    ["indeterminate", 503, "ERR_GITHUB_DISPATCH_UPSTREAM"],
  ] as const)("preserves the %s outcome contract on exact replay", async (outcome, status, errorCode) => {
    const { calls, dependencies, env } = harness();
    dependencies.reserve = async (_env, identity, digest) => {
      calls.push("reserve");
      return {
        kind: "replay",
        identity,
        digest,
        outcome,
        receipt: { outcome, receipt_id: `retained-${outcome}` },
      };
    };

    const response = await handleContinuationDispatch(request(), env, "trace-task-5", dependencies);

    expect(response.status).toBe(status);
    expect(response.headers.get("x-continuation-replay")).toBe("exact");
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: errorCode,
      details: { receipt: { outcome, receipt_id: `retained-${outcome}` } },
    });
    expect(calls).toEqual(["claim", "reserve"]);
  });

  it("serializes retry attempt two through the first attempt identity without a second dispatch", async () => {
    const { calls, dependencies, env } = harness();
    let retainedIdentity: string | undefined;
    let retainedDigest: string | undefined;
    dependencies.reserve = async (_env, identity, digest) => {
      calls.push("reserve");
      if (retainedIdentity === undefined) {
        retainedIdentity = identity;
        retainedDigest = digest;
        return {
          kind: "reserved",
          identity,
          digest,
          reservationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        };
      }
      expect(identity).toBe(retainedIdentity);
      expect(digest).not.toBe(retainedDigest);
      throw new ContinuationDispatchStateConflict();
    };

    const first = await handleContinuationDispatch(request(), env, "trace-task-5", dependencies);
    const second = await handleContinuationDispatch(
      request(JSON.stringify({ ...requestBody, transport_retry_attempt: 2 })),
      env,
      "trace-task-5",
      dependencies,
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(calls.filter((call) => call === "dispatch")).toHaveLength(1);
  });

  it("commits indeterminate evidence before dispatch and preserves it when finalization fails", async () => {
    const { calls, dependencies, env } = harness();
    dependencies.finalize = async () => {
      calls.push("finalize");
      throw new Error("state unavailable");
    };

    const response = await handleContinuationDispatch(request(), env, "trace-task-5", dependencies);
    const payload = await response.json() as { details: { receipt: { outcome: string } } };

    expect(response.status).toBe(503);
    expect(calls.indexOf("commit")).toBeLessThan(calls.indexOf("dispatch"));
    expect(payload.details.receipt.outcome).toBe("indeterminate");
  });

  it("fails a retained digest conflict closed before dispatch", async () => {
    const { dependencies, env } = harness();
    dependencies.reserve = async () => {
      throw new ContinuationDispatchStateConflict();
    };
    const dispatch = vi.spyOn(dependencies, "dispatch");

    const response = await handleContinuationDispatch(request(), env, "trace-task-5", dependencies);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_DISPATCH_REPLAY_CONFLICT",
    });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("fails unavailable and in-progress state closed before live GitHub access", async () => {
    for (const { reserve, status } of [
      {
        reserve: async () => { throw new ContinuationDispatchStateUnavailable("state unavailable"); },
        status: 503,
      },
      {
        reserve: async () => ({ kind: "in_progress" as const, identity: "a".repeat(64), digest: "b".repeat(64) }),
        status: 409,
      },
    ]) {
      const { calls, dependencies, env } = harness();
      dependencies.reserve = reserve;

      const response = await handleContinuationDispatch(request(), env, "trace-task-5", dependencies);

      expect(response.status).toBe(status);
      expect(calls).toEqual(["claim"]);
    }
  });

  it("maps an unexpected reservation implementation failure to unavailable", async () => {
    const { calls, dependencies, env } = harness();
    dependencies.reserve = async () => { throw new Error("unexpected state failure"); };

    const response = await handleContinuationDispatch(request(), env, "trace-task-5", dependencies);

    expect(response.status).toBe(503);
    expect(calls).toEqual(["claim"]);
  });

  it("releases a fresh reservation when the final live PR check is stale", async () => {
    const { calls, dependencies, env } = harness();
    dependencies.readLivePullRequest = async () => {
      calls.push("live-pr");
      throw new ContinuationGitHubAdapterError("live_state_stale");
    };

    const response = await handleContinuationDispatch(request(), env, "trace-task-5", dependencies);

    expect(response.status).toBe(409);
    expect(calls).toEqual(["claim", "reserve", "live-pr", "abort"]);
  });

  it.each([
    [new ContinuationGitHubAdapterError("identity_denied"), 403],
    [new ContinuationGitHubAdapterError("upstream_unavailable"), 503],
    [new Error("GitHub unavailable"), 503],
  ] as const)("releases the reservation before classifying live-state failure %#", async (failure, status) => {
    const { calls, dependencies, env } = harness();
    dependencies.readLivePullRequest = async () => {
      calls.push("live-pr");
      throw failure;
    };

    const response = await handleContinuationDispatch(request(), env, "trace-task-5", dependencies);

    expect(response.status).toBe(status);
    expect(calls).toEqual(["claim", "reserve", "live-pr", "abort"]);
  });

  it("fails closed when a reservation cannot be released after live-state failure", async () => {
    const { dependencies, env } = harness();
    dependencies.readLivePullRequest = async () => { throw new Error("GitHub unavailable"); };
    dependencies.abort = async () => { throw new Error("state unavailable"); };

    const response = await handleContinuationDispatch(request(), env, "trace-task-5", dependencies);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      message: "Continuation reservation could not be released",
    });
  });

  it("releases the reservation when receipt signing is misconfigured", async () => {
    const { calls, dependencies, env } = harness();
    const response = await handleContinuationDispatch(request(), {
      ...env,
      CONTINUATION_RECEIPT_SIGNING_PRIVATE_KEY_PEM: "invalid",
    }, "trace-task-5", dependencies);

    expect(response.status).toBe(503);
    expect(calls).toEqual(["claim", "reserve", "live-pr", "abort"]);
  });

  it("reports signing failure as state-unavailable when its reservation cannot be released", async () => {
    const { dependencies, env } = harness();
    dependencies.abort = async () => { throw new Error("state unavailable"); };
    const response = await handleContinuationDispatch(request(), {
      ...env,
      CONTINUATION_RECEIPT_SIGNING_PRIVATE_KEY_PEM: "invalid",
    }, "trace-task-5", dependencies);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      message: "Continuation reservation could not be released",
    });
  });

  it("does not dispatch when pre-dispatch evidence cannot be committed", async () => {
    const { calls, dependencies, env } = harness();
    dependencies.commit = async () => {
      calls.push("commit");
      throw new Error("state unavailable");
    };

    const response = await handleContinuationDispatch(request(), env, "trace-task-5", dependencies);

    expect(response.status).toBe(503);
    expect(calls).toEqual(["claim", "reserve", "live-pr", "prepare-dispatch", "commit", "abort"]);
  });

  it("releases the reservation when the central credential cannot be prepared", async () => {
    const { calls, dependencies, env } = harness();
    Object.assign(dependencies, {
      prepareDispatch: async () => {
        calls.push("prepare-dispatch");
        throw new ContinuationGitHubAdapterError("upstream_unavailable", 503);
      },
    });

    const response = await handleContinuationDispatch(request(), env, "trace-task-5", dependencies);

    expect(response.status).toBe(503);
    expect(calls).toEqual(["claim", "reserve", "live-pr", "prepare-dispatch", "abort"]);
    await expect(response.json()).resolves.toMatchObject({
      error_code: "ERR_GITHUB_DISPATCH_UPSTREAM",
      message: "Central dispatch credential unavailable",
    });
  });

  it.each(["noema_review_continuation", "strix_scan_continuation"] as const)(
    "returns retained indeterminate evidence when the %s dispatch transport throws",
    async (dispatchAction) => {
      const { calls, dependencies, env } = harness();
      dependencies.dispatch = async () => {
        calls.push("dispatch");
        throw new Error("transport failed");
      };

      const response = await handleContinuationDispatch(request(JSON.stringify({
        ...requestBody,
        dispatch_action: dispatchAction,
      })), env, "trace-task-5", dependencies);
      const payload = await response.json() as { details: { receipt: { outcome: string } } };

      expect(response.status).toBe(503);
      expect(payload.details.receipt.outcome).toBe("indeterminate");
      expect(calls).toEqual([
        "claim",
        "reserve",
        "live-pr",
        "prepare-dispatch",
        "commit",
        "dispatch",
      ]);
    },
  );

  it("returns a signed denied receipt when GitHub rejects the fixed dispatch", async () => {
    const { dependencies, env } = harness();
    dependencies.dispatch = async () => ({
      outcome: "denied",
      upstreamStatus: 403,
      eventType: "noema-review",
    });

    const response = await handleContinuationDispatch(request(), env, "trace-task-5", dependencies);
    const payload = await response.json() as { details: { receipt: unknown } };

    expect(response.status).toBe(502);
    expect(await verifyContinuationReceipt(payload.details.receipt, signingPublicKeyPem)).toBe(true);
  });

  it("fails closed on an impossible adapter outcome", async () => {
    const { dependencies, env } = harness();
    dependencies.dispatch = async () => ({
      outcome: "unexpected",
      eventType: "noema-review",
    }) as never;

    const response = await handleContinuationDispatch(request(), env, "trace-task-5", dependencies);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ message: "Unexpected continuation outcome" });
  });

  it.each(["verifyOidc", "claimOidc"] as const)(
    "classifies unavailable %s infrastructure as upstream instead of invalid identity",
    async (boundary) => {
      const { dependencies, env } = harness();
      dependencies[boundary] = vi.fn(async () => {
        throw { code: boundary === "verifyOidc" ? "ERR_OIDC_VERIFICATION" : "ERR_AUTH_REPLAY", status: 503 };
      }) as never;

      const response = await handleContinuationDispatch(request(), env, "trace-task-5", dependencies);

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toMatchObject({
        ok: false,
        error_code: "ERR_GITHUB_DISPATCH_UPSTREAM",
      });
    },
  );

  it.each([
    ["verify", async (dependencies: ContinuationDispatchHandlerDependencies) => {
      dependencies.verifyOidc = async () => { throw "invalid identity"; };
    }],
    ["claim", async (dependencies: ContinuationDispatchHandlerDependencies) => {
      dependencies.claimOidc = async () => false;
    }],
  ] as const)("denies a non-infrastructure %s failure", async (_boundary, configure) => {
    const { dependencies, env } = harness();
    await configure(dependencies);

    const response = await handleContinuationDispatch(request(), env, "trace-task-5", dependencies);

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(
      'Bearer realm="noema", error="invalid_token"',
    );
    await expect(response.json()).resolves.toMatchObject({
      error_code: "ERR_DISPATCH_IDENTITY_DENIED",
      details: { hint: expect.any(String) },
    });
  });

  it("denies a non-infrastructure replay-claim exception", async () => {
    const { dependencies, env } = harness();
    dependencies.claimOidc = async () => { throw "claim denied"; };

    const response = await handleContinuationDispatch(request(), env, "trace-task-5", dependencies);

    expect(response.status).toBe(401);
  });

  it("rejects a workflow SHA mismatch before replay claim or GitHub access", async () => {
    const { calls, dependencies, env } = harness();
    dependencies.verifyOidc = async () => ({
      repository: requestBody.source_repository,
      job_workflow_ref: workflowRef,
      job_workflow_sha: "f".repeat(40),
      iat: 1_800_000_000,
      exp: 1_800_000_300,
      jti: "wrong-workflow-sha",
    });

    const response = await handleContinuationDispatch(request(), env, "trace-task-5", dependencies);

    expect(response.status).toBe(403);
    expect(calls).toEqual([]);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_DISPATCH_IDENTITY_DENIED",
    });
  });

  it.each([
    ["GET", undefined, 405],
    ["POST", { "content-type": "text/plain" }, 415],
  ])("rejects %s or invalid media type before OIDC verification", async (method, headers, status) => {
    const { dependencies, env } = harness();
    const verify = vi.spyOn(dependencies, "verifyOidc");
    const candidate = method === "GET"
      ? new Request("https://noema.example/v1/continuation-dispatches", { method })
      : request(JSON.stringify(requestBody), { headers });

    const response = await handleContinuationDispatch(candidate, env, "trace-task-5", dependencies);

    expect(response.status).toBe(status);
    expect(verify).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON and a missing bearer before verification", async () => {
    const { dependencies, env } = harness();
    const verify = vi.spyOn(dependencies, "verifyOidc");
    const malformed = await handleContinuationDispatch(request("{"), env, "trace-task-5", dependencies);
    const missingBearer = await handleContinuationDispatch(request(JSON.stringify(requestBody), {
      headers: { authorization: "", "content-type": "application/json" },
    }), env, "trace-task-5", dependencies);

    expect([malformed.status, missingBearer.status]).toEqual([400, 401]);
    expect(verify).not.toHaveBeenCalled();
  });

  it("rejects an invalid declared length and an absent body", async () => {
    const { dependencies, env } = harness();
    const invalidLength = await handleContinuationDispatch(request(JSON.stringify(requestBody), {
      headers: {
        authorization: `Bearer ${testJwt}`,
        "content-type": "application/json",
        "content-length": "01",
      },
    }), env, "trace-task-5", dependencies);
    const absent = await handleContinuationDispatch(new Request(
      "https://noema.example/v1/continuation-dispatches",
      {
        method: "POST",
        headers: { authorization: `Bearer ${testJwt}`, "content-type": "application/json" },
      },
    ), env, "trace-task-5", dependencies);

    expect([invalidLength.status, absent.status]).toEqual([413, 400]);
  });

  it("rejects an absent media type, an oversized declared length, and an absent bearer", async () => {
    const { dependencies, env } = harness();
    const noMediaType = await handleContinuationDispatch(new Request(
      "https://noema.example/v1/continuation-dispatches",
      { method: "POST" },
    ), env, "trace-task-5", dependencies);
    const declaredOversize = await handleContinuationDispatch(request("{}", {
      headers: {
        authorization: `Bearer ${testJwt}`,
        "content-type": "application/json",
        "content-length": "8193",
      },
    }), env, "trace-task-5", dependencies);
    const noBearer = await handleContinuationDispatch(new Request(
      "https://noema.example/v1/continuation-dispatches",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody),
      },
    ), env, "trace-task-5", dependencies);

    expect([noMediaType.status, declaredOversize.status, noBearer.status]).toEqual([415, 413, 401]);
  });

  it("normalizes body reader acquisition and stream failures", async () => {
    const { dependencies, env } = harness();
    const lockedRequest = request();
    const lock = lockedRequest.body!.getReader();
    const locked = await handleContinuationDispatch(lockedRequest, env, "trace-task-5", dependencies);
    lock.releaseLock();
    const streamFailure = await handleContinuationDispatch(new Request(
      "https://noema.example/v1/continuation-dispatches",
      {
        method: "POST",
        headers: { authorization: `Bearer ${testJwt}`, "content-type": "application/json" },
        body: new ReadableStream<Uint8Array>({
          start(controller) { controller.error(new Error("stream failed")); },
        }),
        duplex: "half",
      } as RequestInit & { duplex: "half" },
    ), env, "trace-task-5", dependencies);

    expect([locked.status, streamFailure.status]).toEqual([400, 400]);
  });

  it("keeps rejection authoritative when request-body cancellation rejects", async () => {
    const { dependencies, env } = harness();
    const candidate = new Request("https://noema.example/v1/continuation-dispatches", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: new ReadableStream<Uint8Array>({
        cancel() { throw new Error("cancel failed"); },
      }),
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    const response = await handleContinuationDispatch(candidate, env, "trace-task-5", dependencies);
    await Promise.resolve();

    expect(response.status).toBe(415);
  });

  it("keeps an oversized-stream rejection authoritative when reader cancellation rejects", async () => {
    const { dependencies, env } = harness();
    const candidate = new Request("https://noema.example/v1/continuation-dispatches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: new ReadableStream<Uint8Array>({
        start(controller) { controller.enqueue(new Uint8Array(8_193)); },
        cancel() { throw new Error("cancel failed"); },
      }),
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    const response = await handleContinuationDispatch(candidate, env, "trace-task-5", dependencies);
    await Promise.resolve();

    expect(response.status).toBe(413);
  });

  it("rejects a declared or streamed body above 8 KiB before OIDC verification", async () => {
    const { dependencies, env } = harness();
    const verify = vi.spyOn(dependencies, "verifyOidc");
    const response = await handleContinuationDispatch(
      request(`{"padding":"${"x".repeat(8_192)}"}`),
      env,
      "trace-task-5",
      dependencies,
    );

    expect(response.status).toBe(413);
    expect(verify).not.toHaveBeenCalled();
  });

  it("rejects a stalled body after the absolute read deadline before OIDC verification", async () => {
    vi.useFakeTimers();
    const cancellations: string[] = [];
    const { dependencies, env } = harness();
    const verify = vi.spyOn(dependencies, "verifyOidc");
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"contract_version":'));
      },
      cancel(reason) {
        cancellations.push(String(reason));
      },
    });
    const pending = handleContinuationDispatch(new Request(
      "https://noema.example/v1/continuation-dispatches",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${testJwt}`,
          "content-type": "application/json",
        },
        body: stream,
        duplex: "half",
      } as RequestInit,
    ), env, "trace-task-5", dependencies);

    await vi.advanceTimersByTimeAsync(10_000);
    const response = await pending;

    expect(response.status).toBe(408);
    expect(verify).not.toHaveBeenCalled();
    expect(cancellations).toEqual(["continuation dispatch body read deadline exceeded"]);
  });
});
