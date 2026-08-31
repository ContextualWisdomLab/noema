import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../src/index";

const configuredWorkflowRef =
  "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main";

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
    encodeSegment({ alg: "RS256", kid: "stalled-discovery" }),
    encodeSegment({
      iss: env.ALLOWED_ISSUER,
      aud: env.ALLOWED_AUDIENCE,
      repository_owner: env.ALLOWED_REPOSITORY_OWNER,
      repository: "ContextualWisdomLab/.github",
      job_workflow_ref: configuredWorkflowRef,
      exp: now + 300,
      nbf: now - 30,
      iat: now - 30,
      jti: "stalled-discovery-test",
    }),
    "AA",
  ].join(".");
}

function mockDiscoveryResponse(body: ReadableStream<Uint8Array>): void {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url === "https://token.actions.githubusercontent.com/.well-known/openid-configuration") {
      return new Response(body, {
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("unexpected privileged egress", { status: 500 });
  });
}

async function startExchange(worker: { fetch: (request: Request, env: Env) => Promise<Response> }): Promise<Response> {
  return worker.fetch(
    new Request("https://noema.example/exchange", {
      method: "POST",
      headers: { authorization: `Bearer ${structurallyValidJwt()}` },
    }),
    env,
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("GitHub OIDC external JSON response deadline", () => {
  it("fails closed when the discovery response body stalls below the byte limit", async () => {
    vi.useFakeTimers();
    vi.resetModules();
    const { default: worker } = await import("../src/index");

    let markBodyReadStarted!: () => void;
    const bodyReadStarted = new Promise<void>((resolve) => {
      markBodyReadStarted = resolve;
    });
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      pull() {
        markBodyReadStarted();
        return new Promise<void>(() => undefined);
      },
      cancel,
    }, { highWaterMark: 0 });
    mockDiscoveryResponse(body);

    const exchange = startExchange(worker);
    const outcome = Promise.race([
      exchange.then((response) => ({ kind: "response" as const, response })),
      new Promise<{ kind: "failsafe" }>((resolve) => {
        setTimeout(() => resolve({ kind: "failsafe" }), 10_500);
      }),
    ]);

    await bodyReadStarted;
    await vi.advanceTimersByTimeAsync(10_500);
    const result = await outcome;

    expect(result.kind).toBe("response");
    if (result.kind !== "response") return;
    expect(cancel).toHaveBeenCalledOnce();
    expect(result.response.status).toBe(502);
    await expect(result.response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_OIDC_VERIFICATION",
      message: "GitHub OIDC discovery document was not valid JSON",
    });
  });

  it("keeps the deadline classification when stream cancellation rejects", async () => {
    vi.useFakeTimers();
    vi.resetModules();
    const { default: worker } = await import("../src/index");

    let markBodyReadStarted!: () => void;
    const bodyReadStarted = new Promise<void>((resolve) => {
      markBodyReadStarted = resolve;
    });
    const cancel = vi.fn(() => Promise.reject(new Error("cancel cleanup failed")));
    const body = new ReadableStream<Uint8Array>({
      pull() {
        markBodyReadStarted();
        return new Promise<void>(() => undefined);
      },
      cancel,
    }, { highWaterMark: 0 });
    mockDiscoveryResponse(body);

    const exchange = startExchange(worker);
    const outcome = Promise.race([
      exchange.then((response) => ({ kind: "response" as const, response })),
      new Promise<{ kind: "failsafe" }>((resolve) => {
        setTimeout(() => resolve({ kind: "failsafe" }), 10_500);
      }),
    ]);

    await bodyReadStarted;
    await vi.advanceTimersByTimeAsync(10_500);
    const result = await outcome;

    expect(result.kind).toBe("response");
    if (result.kind !== "response") return;
    expect(cancel).toHaveBeenCalledOnce();
    expect(result.response.status).toBe(502);
    await expect(result.response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_OIDC_VERIFICATION",
      message: "GitHub OIDC discovery document was not valid JSON",
    });
  });

  it("keeps one absolute deadline while a peer trickles bytes", async () => {
    vi.useFakeTimers();
    vi.resetModules();
    const { default: worker } = await import("../src/index");

    let intervalHandle!: ReturnType<typeof setInterval>;
    const cancel = vi.fn(() => clearInterval(intervalHandle));
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        intervalHandle = setInterval(() => {
          controller.enqueue(new Uint8Array([0x20]));
        }, 2_000);
      },
      cancel,
    }, { highWaterMark: 0 });
    mockDiscoveryResponse(body);

    const exchange = startExchange(worker);
    const outcome = Promise.race([
      exchange.then((response) => ({ kind: "response" as const, response })),
      new Promise<{ kind: "failsafe" }>((resolve) => {
        setTimeout(() => resolve({ kind: "failsafe" }), 10_500);
      }),
    ]);

    await vi.advanceTimersByTimeAsync(10_500);
    const result = await outcome;

    expect(result.kind).toBe("response");
    if (result.kind !== "response") return;
    expect(cancel).toHaveBeenCalledOnce();
    expect(result.response.status).toBe(502);
    await expect(result.response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_OIDC_VERIFICATION",
      message: "GitHub OIDC discovery document was not valid JSON",
    });
  });
});
