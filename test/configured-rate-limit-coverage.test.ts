import { describe, expect, it } from "vitest";
import worker, { type Env } from "../src/index";

const baseEnv: Env = {
  ALLOWED_ISSUER: "https://token.actions.githubusercontent.com",
  ALLOWED_AUDIENCE: "cwl-noema-review",
  ALLOWED_REPOSITORY_OWNER: "ContextualWisdomLab",
  ALLOWED_WORKFLOW_REPOSITORY: "ContextualWisdomLab/.github",
  ALLOWED_WORKFLOW_REF_PREFIX: "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main",
  GITHUB_API_BASE: "https://api.github.com",
  GITHUB_APP_ID: "1",
  GITHUB_APP_PRIVATE_KEY_PEM: "unused",
};

function exchangeRequest(client: string): Request {
  return new Request("https://noema.example/exchange", {
    method: "POST",
    headers: { "cf-connecting-ip": client },
  });
}

async function statusesFor(configuredLimit: string | undefined, client: string): Promise<[number, number]> {
  const env: Env = configuredLimit === undefined
    ? { ...baseEnv }
    : { ...baseEnv, NOEMA_RATE_LIMIT_PER_MINUTE: configuredLimit };
  const first = await worker.fetch(exchangeRequest(client), env);
  const second = await worker.fetch(exchangeRequest(client), env);
  return [first.status, second.status];
}

describe("configured local rate-limit coverage", () => {
  it("uses the default finite limit when configuration is absent", async () => {
    await expect(statusesFor(undefined, "198.51.100.201")).resolves.toEqual([401, 401]);
  });

  it.each([
    ["NaN", "198.51.100.202"],
    ["0", "198.51.100.203"],
  ])("fails safe to the default limit for invalid configured value %s", async (configuredLimit, client) => {
    await expect(statusesFor(configuredLimit, client)).resolves.toEqual([401, 401]);
  });

  it("floors a positive fractional configured limit", async () => {
    await expect(statusesFor("1.9", "198.51.100.204")).resolves.toEqual([401, 429]);
  });
});
