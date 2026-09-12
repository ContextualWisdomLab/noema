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
    encodeSegment({ alg: "RS256", kid: "sync-cancel-discovery" }),
    encodeSegment({
      iss: env.ALLOWED_ISSUER,
      aud: env.ALLOWED_AUDIENCE,
      repository_owner: env.ALLOWED_REPOSITORY_OWNER,
      repository: "ContextualWisdomLab/.github",
      job_workflow_ref: configuredWorkflowRef,
      exp: now + 300,
      nbf: now - 30,
      iat: now - 30,
      jti: "sync-cancel-discovery-test",
    }),
    "AA",
  ].join(".");
}

function mockDiscoveryResponse(body: ReadableStream<Uint8Array>): void {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    if (String(input) === "https://token.actions.githubusercontent.com/.well-known/openid-configuration") {
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
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("external JSON synchronous cancellation faults", () => {
  it("keeps the read-deadline decision authoritative when reader.cancel throws synchronously", async () => {
    vi.useFakeTimers();
    vi.resetModules();
    const { default: worker } = await import("../src/index");

    let markReadStarted!: () => void;
    const readStarted = new Promise<void>((resolve) => {
      markReadStarted = resolve;
    });
    const releaseLock = vi.fn();
    const cancel = vi.fn(() => {
      throw new Error("synchronous cancel cleanup failed");
    });
    const reader = {
      read: vi.fn(() => {
        markReadStarted();
        return new Promise<ReadableStreamReadResult<Uint8Array>>(() => undefined);
      }),
      cancel,
      releaseLock,
    } as unknown as ReadableStreamDefaultReader<Uint8Array>;
    const body = new ReadableStream<Uint8Array>();
    vi.spyOn(body, "getReader").mockReturnValue(reader);
    mockDiscoveryResponse(body);

    const exchange = startExchange(worker);
    const outcome = Promise.race([
      exchange.then((response) => ({ kind: "response" as const, response })),
      new Promise<{ kind: "failsafe" }>((resolve) => {
        setTimeout(() => resolve({ kind: "failsafe" }), 10_500);
      }),
    ]);

    await readStarted;
    await vi.advanceTimersByTimeAsync(10_500);
    const result = await outcome;

    expect(result.kind).toBe("response");
    if (result.kind !== "response") return;
    expect(cancel).toHaveBeenCalledOnce();
    expect(releaseLock).toHaveBeenCalledOnce();
    expect(result.response.status).toBe(502);
    await expect(result.response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_OIDC_VERIFICATION",
      message: "GitHub OIDC discovery document was not valid JSON",
    });
  });

  it("keeps the byte-limit decision authoritative when reader.cancel throws synchronously", async () => {
    vi.resetModules();
    const observedSyntaxErrors: string[] = [];
    const OriginalSyntaxError = globalThis.SyntaxError;
    class TrackedSyntaxError extends OriginalSyntaxError {
      constructor(message?: string) {
        super(message);
        observedSyntaxErrors.push(message ?? "");
      }
    }
    vi.stubGlobal("SyntaxError", TrackedSyntaxError);
    const { default: worker } = await import("../src/index");

    const releaseLock = vi.fn();
    const cancel = vi.fn(() => {
      throw new Error("synchronous cancel cleanup failed");
    });
    let readCount = 0;
    const reader = {
      read: vi.fn(async (): Promise<ReadableStreamReadResult<Uint8Array>> => {
        readCount += 1;
        if (readCount === 1) {
          return { done: false, value: new Uint8Array(65_537) };
        }
        return { done: true, value: undefined };
      }),
      cancel,
      releaseLock,
    } as unknown as ReadableStreamDefaultReader<Uint8Array>;
    const body = new ReadableStream<Uint8Array>();
    vi.spyOn(body, "getReader").mockReturnValue(reader);
    mockDiscoveryResponse(body);

    const response = await startExchange(worker);

    expect(cancel).toHaveBeenCalledOnce();
    expect(releaseLock).toHaveBeenCalledOnce();
    expect(observedSyntaxErrors).toContain("JSON response exceeded byte limit");
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_OIDC_VERIFICATION",
      message: "GitHub OIDC discovery document was not valid JSON",
    });
  });
});
