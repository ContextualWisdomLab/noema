import { describe, expect, it, vi } from "vitest";
import { createGithubWorkflowDisablementTransport } from "../scripts/workflow-registry-disable-plan.mjs";

const REPOSITORY = "ContextualWisdomLab/noema";
const MAIN_SHA = "a".repeat(40);
const WORKFLOW_ID = 410;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

function transportFor(response: Response) {
  return createGithubWorkflowDisablementTransport({
    token: "delegated-token",
    fetchImpl: vi.fn(async () => response),
  });
}

describe("privileged workflow disablement JSON boundary", () => {
  it("rejects an advertised Content-Length above the bounded size before reading bytes", async () => {
    const arrayBuffer = vi.fn();
    const response = {
      ok: true,
      status: 200,
      headers: {
        get(name: string) {
          return name.toLowerCase() === "content-length" ? String(MAX_RESPONSE_BYTES + 1) : null;
        },
      },
      arrayBuffer,
    } as unknown as Response;

    await expect(
      transportFor(response).revalidateDefaultBranch({ repository: REPOSITORY }),
    ).rejects.toThrow("response exceeds the bounded size limit");
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it("rejects oversized successful GitHub JSON before parsing", async () => {
    const response = new Response(`{"padding":"${"x".repeat(MAX_RESPONSE_BYTES)}"}`, {
      status: 200,
      headers: { "content-type": "application/json" },
    });

    await expect(
      transportFor(response).revalidateDefaultBranch({ repository: REPOSITORY }),
    ).rejects.toThrow("response exceeds the bounded size limit");
  });

  it("rejects malformed UTF-8 instead of accepting replacement-character decoding", async () => {
    const response = new Response(new Uint8Array([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

    await expect(
      transportFor(response).revalidateDefaultBranch({ repository: REPOSITORY }),
    ).rejects.toThrow("response contains invalid UTF-8");
  });

  it("rejects duplicate decoded object keys before last-key-wins JSON parsing", async () => {
    const response = new Response(
      `{"commit":{"sha":"${MAIN_SHA}"},"comm\\u0069t":{"sha":"${"b".repeat(40)}"}}`,
      { status: 200, headers: { "content-type": "application/json" } },
    );

    await expect(
      transportFor(response).revalidateDefaultBranch({ repository: REPOSITORY }),
    ).rejects.toThrow("response contains duplicate decoded JSON keys");
  });

  it("applies the same strict JSON boundary to workflow identity revalidation", async () => {
    const response = new Response(
      `{"id":${WORKFLOW_ID},"path":".github/workflows/a.yml","state":"active","st\\u0061te":"disabled_manually"}`,
      { status: 200, headers: { "content-type": "application/json" } },
    );

    await expect(
      transportFor(response).revalidateWorkflow({ repository: REPOSITORY, workflowId: WORKFLOW_ID }),
    ).rejects.toThrow("response contains duplicate decoded JSON keys");
  });
});
