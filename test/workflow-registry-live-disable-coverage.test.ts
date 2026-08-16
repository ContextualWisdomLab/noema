import { describe, expect, it, vi } from "vitest";
import {
  collectLiveWorkflowRecords,
  createWorkflowRegistryGithubJsonReader,
  runWorkflowRegistryDisablement,
} from "../scripts/workflow-registry-live-disable.mjs";

const REPOSITORY = "ContextualWisdomLab/noema";
const MAIN_SHA = "a".repeat(40);
const ORPHAN_PATH = ".github/workflows/obsolete-repair.yml";
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

function fakeResponse({ ok = true, status = 200, headers = {}, body = "{}" }: { ok?: boolean; status?: number; headers?: Record<string, string>; body?: string | Uint8Array } = {}) {
  const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
  return { ok, status, headers: { get(name: string) { return headers[name.toLowerCase()] ?? null; } }, async arrayBuffer() { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); } };
}

function activeAudit() {
  return { schema_version: 1, repository_full_name: REPOSITORY, default_branch_sha: MAIN_SHA, observed_at: "2026-08-16T03:10:00.000Z", pagination_receipts: [{ page: 1, itemCount: 1, hasNext: false }], status: "FAIL", failures: [{ code: "active_orphan_workflow", workflow_id: 101, detail: "Active workflow is absent from protected main." }], workflows: [{ workflow_id: 101, workflow_path: ORPHAN_PATH, workflow_state: "active", classification: "active_orphan" }] };
}

function disabledAudit(overrides: Record<string, unknown> = {}) {
  return { schema_version: 1, repository_full_name: REPOSITORY, default_branch_sha: MAIN_SHA, observed_at: "2026-08-16T03:10:01.000Z", pagination_receipts: [{ page: 1, itemCount: 1, hasNext: false }], status: "PASS", failures: [], workflows: [{ workflow_id: 101, workflow_path: ORPHAN_PATH, workflow_state: "disabled_manually", classification: "disabled_registry_record" }], ...overrides };
}

function validTransport() {
  return { revalidateDefaultBranch: vi.fn().mockResolvedValue({ sha: MAIN_SHA }), revalidateWorkflow: vi.fn().mockResolvedValueOnce({ id: 101, path: ORPHAN_PATH, state: "active" }).mockResolvedValueOnce({ id: 101, path: ORPHAN_PATH, state: "disabled_manually" }), disableWorkflow: vi.fn().mockResolvedValue(undefined) };
}

describe("workflow registry bounded GitHub reader", () => {
  it("rejects missing credentials and fetch capability before making a request", () => {
    expect(() => createWorkflowRegistryGithubJsonReader({ token: "" })).toThrow("requires a delegated token");
    expect(() => createWorkflowRegistryGithubJsonReader({ token: "delegated", fetchImpl: 0 as never })).toThrow("requires fetch capability");
  });

  it("pins reads to safe Noema repository endpoints", async () => {
    const fetchImpl = vi.fn();
    const reader = createWorkflowRegistryGithubJsonReader({ token: "delegated", fetchImpl });
    await expect(reader("")).rejects.toThrow("endpoint is invalid");
    await expect(reader("repos\\ContextualWisdomLab/noema/actions/workflows")).rejects.toThrow("endpoint is invalid");
    await expect(reader("https://example.com/repos/ContextualWisdomLab/noema/actions/workflows")).rejects.toThrow("escapes the Noema repository boundary");
    await expect(reader("repos/ContextualWisdomLab/other/actions/workflows")).rejects.toThrow("escapes the Noema repository boundary");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns validated JSON and sends the delegated token only in the request header", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse({ body: '{"total_count":0,"workflows":[]}' }));
    const reader = createWorkflowRegistryGithubJsonReader({ token: "delegated-token", fetchImpl });
    await expect(reader("repos/ContextualWisdomLab/noema/actions/workflows?per_page=100&page=1")).resolves.toEqual({ total_count: 0, workflows: [] });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, options] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe("https://api.github.com/repos/ContextualWisdomLab/noema/actions/workflows?per_page=100&page=1");
    expect(options.method).toBe("GET");
    expect(options.redirect).toBe("error");
    expect(options.cache).toBe("no-store");
    expect(options.headers.Authorization).toBe("Bearer delegated-token");
  });

  it("maps timeout and network failures to bounded non-secret diagnostics", async () => {
    const timeout = Object.assign(new Error("Bearer delegated-token"), { name: "TimeoutError" });
    const timeoutReader = createWorkflowRegistryGithubJsonReader({ token: "delegated-token", fetchImpl: vi.fn().mockRejectedValue(timeout) });
    await expect(timeoutReader("repos/ContextualWisdomLab/noema/actions/workflows")).rejects.toThrow("request timed out");
    const networkReader = createWorkflowRegistryGithubJsonReader({ token: "delegated-token", fetchImpl: vi.fn().mockRejectedValue(new Error("ghp_secret")) });
    await expect(networkReader("repos/ContextualWisdomLab/noema/actions/workflows")).rejects.toThrow("failed before receiving an HTTP response");
  });

  it("fails closed on non-success, oversized, malformed UTF-8, duplicate-key, and invalid JSON bodies", async () => {
    const endpoint = "repos/ContextualWisdomLab/noema/actions/workflows";
    const cases: Array<[ReturnType<typeof fakeResponse>, string]> = [
      [fakeResponse({ ok: false, status: 503 }), "failed with HTTP 503"],
      [fakeResponse({ headers: { "content-length": String(MAX_RESPONSE_BYTES + 1) } }), "exceeds the bounded size limit"],
      [fakeResponse({ body: new Uint8Array(MAX_RESPONSE_BYTES + 1) }), "exceeds the bounded size limit"],
      [fakeResponse({ body: new Uint8Array([0xff]) }), "contains invalid UTF-8"],
      [fakeResponse({ body: '{"workflow":1,"workflow":2}' }), "duplicate decoded JSON keys"],
      [fakeResponse({ body: "{" }), "Expected an object key at character 1."],
    ];
    for (const [response, message] of cases) {
      const reader = createWorkflowRegistryGithubJsonReader({ token: "delegated", fetchImpl: vi.fn().mockResolvedValue(response) });
      await expect(reader(endpoint)).rejects.toThrow(message);
    }
  });
});

describe("immediate full workflow registry refresh", () => {
  it("rejects any repository or reader outside the exact Noema authority", async () => {
    await expect(collectLiveWorkflowRecords({ repository: "ContextualWisdomLab/other", ghJson: vi.fn() })).rejects.toThrow("restricted to ContextualWisdomLab/noema");
    await expect(collectLiveWorkflowRecords({ repository: REPOSITORY, ghJson: 0 as never })).rejects.toThrow("restricted to ContextualWisdomLab/noema");
  });

  it("collects every paginated registry record and preserves page order", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({ id: index + 1, path: `.github/workflows/workflow-${index + 1}.yml`, state: "active" }));
    const finalWorkflow = { id: 101, path: ".github/workflows/workflow-101.yml", state: "disabled_manually" };
    const ghJson = vi.fn().mockResolvedValueOnce({ total_count: 101, workflows: firstPage }).mockResolvedValueOnce({ total_count: 101, workflows: [finalWorkflow] });
    const workflows = await collectLiveWorkflowRecords({ repository: REPOSITORY, ghJson });
    expect(workflows).toHaveLength(101);
    expect(workflows[0]).toEqual(firstPage[0]);
    expect(workflows[100]).toEqual(finalWorkflow);
    expect(ghJson).toHaveBeenCalledTimes(2);
  });

  it("fails closed when total count changes or a terminal page does not retain that count", async () => {
    const changedTotal = vi.fn().mockResolvedValueOnce({ total_count: 101, workflows: [] }).mockResolvedValueOnce({ total_count: 100, workflows: [] });
    await expect(collectLiveWorkflowRecords({ repository: REPOSITORY, ghJson: changedTotal })).rejects.toThrow("total changed during immediate pre-mutation refresh");
    await expect(collectLiveWorkflowRecords({ repository: REPOSITORY, ghJson: vi.fn().mockResolvedValue({ total_count: 2, workflows: [{ id: 1 }] }) })).rejects.toThrow("did not retain the advertised record count");
  });

  it("bounds pathological pagination even when the remote count never terminates", async () => {
    const ghJson = vi.fn().mockResolvedValue({ total_count: 100_001, workflows: [] });
    await expect(collectLiveWorkflowRecords({ repository: REPOSITORY, ghJson })).rejects.toThrow("pagination exceeded the bounded page limit");
    expect(ghJson).toHaveBeenCalledTimes(1_000);
  });
});

describe("disablement input and postcondition boundaries", () => {
  it("rejects invalid repository, workflow identity, collectors, and transport", async () => {
    await expect(runWorkflowRegistryDisablement({ repository: "other", workflowId: 101 })).rejects.toThrow("restricted to ContextualWisdomLab/noema");
    await expect(runWorkflowRegistryDisablement({ repository: REPOSITORY, workflowId: 0 })).rejects.toThrow("positive safe integer");
    await expect(runWorkflowRegistryDisablement({ repository: REPOSITORY, workflowId: 101 })).rejects.toThrow("missing fresh evidence collectors");
    await expect(runWorkflowRegistryDisablement({ repository: REPOSITORY, workflowId: 101, collectAudit: vi.fn(), collectLiveWorkflows: vi.fn(), transport: {} })).rejects.toThrow("missing authorized transport");
  });

  it("does not mutate when fresh planning is non-authorizing", async () => {
    const transport = validTransport();
    await expect(runWorkflowRegistryDisablement({ repository: REPOSITORY, workflowId: 101, collectAudit: vi.fn().mockResolvedValue(activeAudit()), collectLiveWorkflows: vi.fn().mockResolvedValue([{ id: 101, path: ORPHAN_PATH, state: "active" }, { id: 101, path: ".github/workflows/reused.yml", state: "active" }]), transport })).rejects.toThrow("fresh workflow disablement plan is non-authorizing");
    expect(transport.disableWorkflow).not.toHaveBeenCalled();
  });

  it("rejects a post-audit repository substitution", async () => {
    const collectAudit = vi.fn().mockResolvedValueOnce(activeAudit()).mockResolvedValueOnce(disabledAudit({ repository_full_name: "ContextualWisdomLab/other" }));
    await expect(runWorkflowRegistryDisablement({ repository: REPOSITORY, workflowId: 101, collectAudit, collectLiveWorkflows: vi.fn().mockResolvedValue([{ id: 101, path: ORPHAN_PATH, state: "active" }]), transport: validTransport() })).rejects.toThrow("repository identity changed during post-disablement verification");
  });

  it("rejects a post-audit that loses or changes the exact disabled workflow identity", async () => {
    const invalidPostStates = [[], [{ workflow_id: 101, workflow_path: ".github/workflows/different.yml", workflow_state: "disabled_manually", classification: "disabled_registry_record" }], [{ workflow_id: 101, workflow_path: ORPHAN_PATH, workflow_state: "active", classification: "active_orphan" }]];
    for (const workflows of invalidPostStates) {
      const collectAudit = vi.fn().mockResolvedValueOnce(activeAudit()).mockResolvedValueOnce(disabledAudit({ workflows }));
      await expect(runWorkflowRegistryDisablement({ repository: REPOSITORY, workflowId: 101, collectAudit, collectLiveWorkflows: vi.fn().mockResolvedValue([{ id: 101, path: ORPHAN_PATH, state: "active" }]), transport: validTransport() })).rejects.toThrow("did not retain the exact disabled workflow identity");
    }
  });
});
