import { describe, expect, it, vi } from "vitest";
import entrypoint, { type Env } from "../src/runtime-entrypoint";

describe("Noema readiness with absent configuration", () => {
  it("fails every required offline check while leaving installation discovery optional", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const response = await entrypoint.fetch(
      new Request("https://noema.example/ready"),
      {} as Env,
    );
    const payload = await response.json() as {
      details: { failed_checks: string };
    };

    expect(response.status).toBe(503);
    expect(payload.details.failed_checks).toBe(
      [
        "allowed_issuer",
        "allowed_audience",
        "allowed_repository_owner",
        "allowed_workflow_repository",
        "allowed_workflow_ref",
        "allowed_workflow_sha",
        "github_api_base",
        "github_app_id",
        "github_app_private_key",
        "noema_rate_limiter",
        "noema_oidc_replay_guard",
      ].join(","),
    );
    expect(payload.details.failed_checks).not.toContain("github_app_installation_id");

    vi.restoreAllMocks();
  });
});
