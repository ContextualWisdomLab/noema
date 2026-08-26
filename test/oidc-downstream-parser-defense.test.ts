import { afterEach, describe, expect, it, vi } from "vitest";

const env = {
  ALLOWED_ISSUER: "https://token.actions.githubusercontent.com",
  ALLOWED_AUDIENCE: "cwl-noema-review",
  ALLOWED_REPOSITORY_OWNER: "ContextualWisdomLab",
  ALLOWED_WORKFLOW_REPOSITORY: "ContextualWisdomLab/.github",
  ALLOWED_WORKFLOW_REF_PREFIX:
    "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main",
  ALLOWED_WORKFLOW_SHA: "a".repeat(40),
  GITHUB_API_BASE: "https://api.github.com",
  GITHUB_APP_ID: "1",
  GITHUB_APP_PRIVATE_KEY_PEM: "unused-before-verification",
  NOEMA_RATE_LIMIT_PER_MINUTE: "1000",
};

const base64UrlAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const canonicalHeader = Buffer.from(JSON.stringify({ alg: "RS256", kid: "kid" })).toString("base64url");

function sameBytesNonCanonicalBase64Url(segment: string): string {
  if (segment.length % 4 !== 2 && segment.length % 4 !== 3) {
    throw new Error("fixture requires an unpadded base64url tail");
  }
  const lastIndex = base64UrlAlphabet.indexOf(segment.at(-1) ?? "");
  if (lastIndex < 0) throw new Error("fixture tail must be base64url");
  return `${segment.slice(0, -1)}${base64UrlAlphabet[lastIndex + 1]}`;
}

async function exchangeWithParserRegression(token: string): Promise<Response> {
  vi.resetModules();
  vi.doMock("../src/bearer-authorization", () => ({
    parseExactBearerToken: () => token,
  }));
  const { default: worker } = await import("../src/index");
  const fetchSpy = vi.spyOn(globalThis, "fetch");

  const response = await worker.fetch(
    new Request("https://noema.example/exchange", {
      method: "POST",
      headers: {
        authorization: "Bearer ignored-by-regression-seam",
        "content-type": "application/json",
      },
      body: JSON.stringify({ target_repository: "ContextualWisdomLab/noema" }),
    }),
    env,
  );

  expect(fetchSpy).not.toHaveBeenCalled();
  return response;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock("../src/bearer-authorization");
  vi.resetModules();
});

describe("authoritative OIDC verifier defense when the shared bearer parser regresses", () => {
  it("still rejects a non-three-segment JWT before OIDC egress", async () => {
    const response = await exchangeWithParserRegression(`${canonicalHeader}.e30`);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_TOKEN_MALFORMED",
    });
  });

  it("still rejects a segment whose base64url decoder throws before OIDC egress", async () => {
    const response = await exchangeWithParserRegression(`${canonicalHeader}.%.AA`);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_TOKEN_MALFORMED",
    });
  });

  it("still rejects non-canonical base64url pad bits before OIDC egress", async () => {
    const canonicalPayload = Buffer.from("{}", "utf8").toString("base64url");
    const nonCanonicalPayload = sameBytesNonCanonicalBase64Url(canonicalPayload);
    expect(Buffer.from(nonCanonicalPayload, "base64url")).toEqual(Buffer.from(canonicalPayload, "base64url"));

    const response = await exchangeWithParserRegression(`${canonicalHeader}.${nonCanonicalPayload}.AA`);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_TOKEN_MALFORMED",
    });
  });
});
