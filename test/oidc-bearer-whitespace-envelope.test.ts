import { describe, expect, it, vi } from "vitest";
import entrypoint, { isBoundedOidcBearer, type Env } from "../src/entrypoint";

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
});
