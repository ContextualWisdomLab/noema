import { describe, expect, it, vi } from "vitest";
import {
  buildWorkflowDisablementPlan,
  createGithubWorkflowDisablementTransport,
  executeWorkflowDisablement,
} from "../scripts/workflow-registry-disable-plan.mjs";

const REPOSITORY = "ContextualWisdomLab/noema";
const DEFAULT_BRANCH_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const WORKFLOW_ID = 410;
const WORKFLOW_PATH = ".github/workflows/one-shot-old-repair.yml";

function authoritativePlan() {
  return buildWorkflowDisablementPlan({
    audit: {
      schema_version: 1,
      repository_full_name: REPOSITORY,
      default_branch_sha: DEFAULT_BRANCH_SHA,
      observed_at: "2026-08-14T03:30:00.000Z",
      pagination_receipts: [{ page: 1, itemCount: 1, hasNext: false }],
      status: "FAIL",
      failures: [
        {
          code: "active_orphan_workflow",
          workflow_id: WORKFLOW_ID,
          detail: "bounded executor capability fixture",
        },
      ],
      workflows: [
        {
          workflow_id: WORKFLOW_ID,
          workflow_path: WORKFLOW_PATH,
          workflow_state: "active",
          classification: "active_orphan",
        },
      ],
    },
    expectedRepository: REPOSITORY,
    expectedDefaultBranchSha: DEFAULT_BRANCH_SHA,
    liveWorkflows: [
      {
        id: WORKFLOW_ID,
        path: WORKFLOW_PATH,
        state: "active",
      },
    ],
  });
}

describe("workflow disablement executor capability contract", () => {
  it("refuses a missing live-revalidation capability before any mutation", async () => {
    const plan = authoritativePlan();
    expect(plan.status).toBe("PASS");
    const disableWorkflow = vi.fn(async () => undefined);

    await expect(
      executeWorkflowDisablement({
        plan,
        candidate: plan.disablements[0],
        disableWorkflow,
      }),
    ).rejects.toThrow("disablement executor is invalid");

    expect(disableWorkflow).not.toHaveBeenCalled();
  });

  it("refuses a missing disable capability before performing live revalidation", async () => {
    const plan = authoritativePlan();
    expect(plan.status).toBe("PASS");
    const revalidateWorkflow = vi.fn(async () => ({
      id: WORKFLOW_ID,
      path: WORKFLOW_PATH,
      state: "active",
    }));

    await expect(
      executeWorkflowDisablement({
        plan,
        candidate: plan.disablements[0],
        revalidateWorkflow,
      }),
    ).rejects.toThrow("disablement executor is invalid");

    expect(revalidateWorkflow).not.toHaveBeenCalled();
  });

  it("uses exact GitHub REST identities and keeps the delegated token out of results", async () => {
    const delegatedToken = "secret-delegated-token";
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/branches/main")) {
        return new Response(JSON.stringify({ commit: { sha: DEFAULT_BRANCH_SHA } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith(`/actions/workflows/${WORKFLOW_ID}/disable`)) {
        expect(init?.method).toBe("PUT");
        return new Response(null, { status: 204 });
      }
      if (url.endsWith(`/actions/workflows/${WORKFLOW_ID}`)) {
        return new Response(JSON.stringify({
          id: WORKFLOW_ID,
          path: WORKFLOW_PATH,
          state: "active",
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("unexpected", { status: 404 });
    });

    const transport = createGithubWorkflowDisablementTransport({
      fetchImpl,
      token: delegatedToken,
    });

    await expect(transport.revalidateDefaultBranch({ repository: REPOSITORY })).resolves.toEqual({
      sha: DEFAULT_BRANCH_SHA,
    });
    await expect(transport.revalidateWorkflow({
      repository: REPOSITORY,
      workflowId: WORKFLOW_ID,
    })).resolves.toEqual({
      id: WORKFLOW_ID,
      path: WORKFLOW_PATH,
      state: "active",
    });
    await expect(transport.disableWorkflow({
      repository: REPOSITORY,
      workflowId: WORKFLOW_ID,
    })).resolves.toBeUndefined();

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    for (const [, init] of fetchImpl.mock.calls) {
      expect(init?.headers).toMatchObject({
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${delegatedToken}`,
        "X-GitHub-Api-Version": "2026-03-10",
      });
      expect(JSON.stringify(init)).not.toContain("GITHUB_TOKEN");
    }
    expect(JSON.stringify(transport)).not.toContain(delegatedToken);
  });

  it("fails closed when the transport capability is incomplete", () => {
    expect(() => createGithubWorkflowDisablementTransport({ token: "delegated-token" })).toThrow(
      "workflow disablement transport is invalid",
    );
    expect(() => createGithubWorkflowDisablementTransport({ fetchImpl: vi.fn(), token: "" })).toThrow(
      "workflow disablement transport is invalid",
    );
  });

  it("fails closed on wrong repository identity before network access", async () => {
    const fetchImpl = vi.fn();
    const transport = createGithubWorkflowDisablementTransport({
      fetchImpl,
      token: "delegated-token",
    });

    await expect(transport.revalidateDefaultBranch({ repository: "other/repo" })).rejects.toThrow(
      "workflow disablement transport repository identity is invalid",
    );
    await expect(transport.revalidateWorkflow({
      repository: "other/repo",
      workflowId: WORKFLOW_ID,
    })).rejects.toThrow("workflow disablement transport repository identity is invalid");
    await expect(transport.disableWorkflow({
      repository: "other/repo",
      workflowId: WORKFLOW_ID,
    })).rejects.toThrow("workflow disablement transport repository identity is invalid");

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails closed on malformed workflow identity and non-success GitHub responses", async () => {
    const fetchImpl = vi.fn(async () => new Response("denied", { status: 403 }));
    const transport = createGithubWorkflowDisablementTransport({
      fetchImpl,
      token: "delegated-token",
    });

    await expect(transport.revalidateWorkflow({
      repository: REPOSITORY,
      workflowId: 0,
    })).rejects.toThrow("workflow disablement transport workflow identity is invalid");
    await expect(transport.disableWorkflow({
      repository: REPOSITORY,
      workflowId: Number.NaN,
    })).rejects.toThrow("workflow disablement transport workflow identity is invalid");
    await expect(transport.revalidateDefaultBranch({ repository: REPOSITORY })).rejects.toThrow(
      "GitHub workflow disablement transport request failed with HTTP 403",
    );
  });

  it("fails closed on malformed successful GitHub JSON responses", async () => {
    const fetchImpl = vi.fn(async () => new Response("not-json", {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    const transport = createGithubWorkflowDisablementTransport({
      fetchImpl,
      token: "delegated-token",
    });

    await expect(transport.revalidateDefaultBranch({ repository: REPOSITORY })).rejects.toThrow(
      "GitHub workflow disablement transport returned invalid JSON",
    );
  });

  it("fails closed on invalid protected-main response identity", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ commit: { sha: "short" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    const transport = createGithubWorkflowDisablementTransport({
      fetchImpl,
      token: "delegated-token",
    });

    await expect(transport.revalidateDefaultBranch({ repository: REPOSITORY })).rejects.toThrow(
      "GitHub workflow disablement transport returned invalid protected-main identity",
    );
  });

  it("fails closed on invalid live workflow response fields", async () => {
    const responses = [
      { id: WORKFLOW_ID + 1, path: WORKFLOW_PATH, state: "active" },
      { id: WORKFLOW_ID, path: "../unsafe.yml", state: "active" },
      { id: WORKFLOW_ID, path: WORKFLOW_PATH, state: null },
    ];
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(responses.shift()), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    const transport = createGithubWorkflowDisablementTransport({
      fetchImpl,
      token: "delegated-token",
    });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(transport.revalidateWorkflow({
        repository: REPOSITORY,
        workflowId: WORKFLOW_ID,
      })).rejects.toThrow("GitHub workflow disablement transport returned invalid workflow identity");
    }
  });
});
