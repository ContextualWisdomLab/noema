import { beforeAll, describe, expect, it, vi } from "vitest";
import baseWorker from "../src/index";
import runtimeWorker from "../src/runtime-entrypoint";
import protectedWorker from "../src/worker";
import {
  handleContinuationDispatch,
  type ContinuationDispatchHandlerDependencies,
} from "../src/continuation-dispatch/handler";
import { ContinuationDispatchStateConflict } from "../src/continuation-dispatch/dispatch-state";
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
    dispatch: async () => {
      calls.push("dispatch");
      return { outcome: "accepted" as const, upstreamStatus: 204, eventType: "noema-review" as const };
    },
    commit: async (_env, _reservation, receipt) => {
      calls.push("commit");
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
    expect(calls).toEqual(["claim", "live-pr", "reserve", "dispatch", "commit"]);
    await expect(verifyContinuationReceipt(payload.data.receipt, signingPublicKeyPem)).resolves.toBe(true);
    expect(JSON.stringify(payload)).not.toMatch(/token|bearer|assertion|private_key/i);
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
});
