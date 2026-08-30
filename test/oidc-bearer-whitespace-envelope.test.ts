import { describe, expect, it, vi } from "vitest";
import entrypoint, { isBoundedOidcBearer, type Env } from "../src/entrypoint";
import runtimeEntrypoint, { type Env as RuntimeEnv } from "../src/runtime-entrypoint";

function encodeJsonSegment(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

describe("OIDC bearer envelope whitespace boundary", () => {
  it("rejects embedded credential whitespace before downstream JWT parsing", async () => {
    const authorization = "Bearer one.two .three";
    expect(isBoundedOidcBearer(authorization)).toBe(false);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const response = await entrypoint.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: {
          authorization,
          "x-request-id": "bearer-whitespace-envelope",
        },
      }),
      { GITHUB_API_BASE: "https://api.github.com" } as Env,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_TOKEN_MALFORMED",
      details: { policy: "bounded-oidc-jwt-envelope" },
      trace_id: "bearer-whitespace-envelope",
    });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('"event":"oidc_token_envelope"'));
    expect(logSpy.mock.calls.flat().join("\n")).not.toContain(authorization);
  });

  it("rejects non-canonical bearer separators before credential parsing", async () => {
    const nonCanonicalAuthorizations = [
      "Bearer\tone.two.three",
      "Bearer\u00a0one.two.three",
    ];

    for (const authorization of nonCanonicalAuthorizations) {
      expect(isBoundedOidcBearer(authorization)).toBe(false);
    }

    const authorization = "Bearer\u00a0one.two.three";
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const response = await entrypoint.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: {
          authorization,
          "x-request-id": "bearer-noncanonical-separator",
        },
      }),
      { GITHUB_API_BASE: "https://api.github.com" } as Env,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_TOKEN_MALFORMED",
      details: { policy: "bounded-oidc-jwt-envelope" },
      trace_id: "bearer-noncanonical-separator",
    });
    expect(logSpy.mock.calls.flat().join("\n")).not.toContain(authorization);
  });

  it("does not let the runtime source prefilter treat a non-canonical bearer separator as workflow authority", async () => {
    const workflowRef = "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main";
    const payload = encodeJsonSegment({
      job_workflow_ref: workflowRef,
      job_workflow_sha: "b".repeat(40),
    });
    const authorization = `Bearer\te30.${payload}.c2ln`;
    const response = await runtimeEntrypoint.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: {
          authorization,
          "x-request-id": "runtime-bearer-separator",
        },
      }),
      {
        GITHUB_API_BASE: "https://api.github.com",
        ALLOWED_REPOSITORY_OWNER: "ContextualWisdomLab",
        ALLOWED_WORKFLOW_REPOSITORY: "ContextualWisdomLab/.github",
        ALLOWED_WORKFLOW_REF_PREFIX: workflowRef,
        ALLOWED_WORKFLOW_SHA: "a".repeat(40),
      } as RuntimeEnv,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_TOKEN_MALFORMED",
      details: { policy: "bounded-oidc-jwt-envelope" },
      trace_id: "runtime-bearer-separator",
    });
  });
});
