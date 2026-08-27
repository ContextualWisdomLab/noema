import { describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../src/index";

const env: Env = {
  ALLOWED_ISSUER: "https://token.actions.githubusercontent.com",
  ALLOWED_AUDIENCE: "cwl-noema-review",
  ALLOWED_REPOSITORY_OWNER: "ContextualWisdomLab",
  ALLOWED_WORKFLOW_REPOSITORY: "ContextualWisdomLab/.github",
  ALLOWED_WORKFLOW_REF_PREFIX: "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main",
  ALLOWED_WORKFLOW_SHA: "a".repeat(40),
  GITHUB_API_BASE: "https://api.github.com",
  GITHUB_APP_ID: "1",
  GITHUB_APP_PRIVATE_KEY_PEM: "unused",
  NOEMA_RATE_LIMIT_PER_MINUTE: "50000",
};

describe("local rate-limit configuration boundary", () => {
  it("clamps defense-in-depth exchange throttling to the documented 10,000 request ceiling", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const request = () => new Request("https://noema.example/exchange", {
      method: "POST",
      headers: { "cf-connecting-ip": "203.0.113.231" },
    });

    for (let attempt = 0; attempt < 10_000; attempt += 1) {
      const response = await worker.fetch(request(), env);
      expect(response.status).toBe(401);
    }

    const rejected = await worker.fetch(request(), env);
    expect(rejected.status).toBe(429);
    expect(rejected.headers.get("retry-after")).toBeTruthy();
    await expect(rejected.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_RATE_LIMIT",
    });
  }, 30_000);

  it("does not normalize alternate textual spellings into local throttle authority", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const nonCanonicalEnv: Env = {
      ...env,
      NOEMA_RATE_LIMIT_PER_MINUTE: " 1 ",
    };
    const request = () => new Request("https://noema.example/exchange", {
      method: "POST",
      headers: { "cf-connecting-ip": "203.0.113.232" },
    });

    expect((await worker.fetch(request(), nonCanonicalEnv)).status).toBe(401);
    expect((await worker.fetch(request(), nonCanonicalEnv)).status).toBe(401);
  });

  it("does not collapse non-ASCII-whitespace client identity into the canonical local bucket", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const strictEnv: Env = {
      ...env,
      NOEMA_RATE_LIMIT_PER_MINUTE: "1",
    };
    const nonCanonicalRequest = () => new Request("https://noema.example/exchange", {
      method: "POST",
      headers: { "cf-connecting-ip": "\u00a0203.0.113.233\u00a0" },
    });
    const canonicalRequest = () => new Request("https://noema.example/exchange", {
      method: "POST",
      headers: { "cf-connecting-ip": "203.0.113.233" },
    });

    expect((await worker.fetch(nonCanonicalRequest(), strictEnv)).status).toBe(401);
    expect((await worker.fetch(canonicalRequest(), strictEnv)).status).toBe(401);
    expect((await worker.fetch(canonicalRequest(), strictEnv)).status).toBe(429);
  });
});
