import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { main } from "../scripts/workflow-registry-live-disable.mjs";

const REPOSITORY = "ContextualWisdomLab/noema";
const MAIN_SHA = "a".repeat(40);
const WORKFLOW_ID = 101;
const ORPHAN_PATH = ".github/workflows/obsolete-repair.yml";

function githubResponse(body: unknown, status = 200) {
  const text = status === 204 ? "" : JSON.stringify(body);
  const bytes = new TextEncoder().encode(text);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name: string) {
        const normalized = name.toLowerCase();
        if (normalized === "content-type" && status !== 204) return "application/json";
        if (normalized === "content-length") return String(bytes.byteLength);
        return null;
      },
    },
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
    async text() {
      return text;
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("workflow registry live-disable executable main", () => {
  it("uses an owner-only delegated capability to disable one audited orphan and retain a full post-audit receipt", async () => {
    const directory = await mkdtemp(join(tmpdir(), "noema-workflow-disable-"));
    const tokenPath = join(directory, "github-token");
    const originalArgv = process.argv;
    let workflowState = "active";

    try {
      await writeFile(tokenPath, "delegated-token", { encoding: "utf8", mode: 0o600 });
      await chmod(tokenPath, 0o600);
      vi.stubEnv("GITHUB_REPOSITORY", REPOSITORY);
      vi.stubEnv("NOEMA_MAINTAINER_TOKEN_PATH", tokenPath);
      process.argv = ["node", "workflow-registry-live-disable.mjs", String(WORKFLOW_ID)];

      const fetchImpl = vi.fn(async (input: URL | string, options: { method?: string } = {}) => {
        const url = String(input);
        const method = options.method ?? "GET";

        if (url.endsWith(`/repos/${REPOSITORY}/branches/main`) && method === "GET") {
          return githubResponse({ commit: { sha: MAIN_SHA } });
        }
        if (url.includes(`/repos/${REPOSITORY}/git/trees/${MAIN_SHA}?recursive=1`) && method === "GET") {
          return githubResponse({
            truncated: false,
            tree: [{ type: "blob", path: ".github/workflows/ci.yml" }],
          });
        }
        if (url.includes(`/repos/${REPOSITORY}/actions/workflows?`) && method === "GET") {
          return githubResponse({
            total_count: 1,
            workflows: [{ id: WORKFLOW_ID, path: ORPHAN_PATH, state: workflowState }],
          });
        }
        if (url.includes(`/repos/${REPOSITORY}/pulls?state=open`) && method === "GET") {
          return githubResponse([]);
        }
        if (url.endsWith(`/repos/${REPOSITORY}/actions/workflows/${WORKFLOW_ID}`) && method === "GET") {
          return githubResponse({ id: WORKFLOW_ID, path: ORPHAN_PATH, state: workflowState });
        }
        if (url.endsWith(`/repos/${REPOSITORY}/actions/workflows/${WORKFLOW_ID}/disable`) && method === "PUT") {
          workflowState = "disabled_manually";
          return githubResponse(undefined, 204);
        }
        throw new Error(`unexpected GitHub request: ${method} ${url}`);
      });
      vi.stubGlobal("fetch", fetchImpl);
      const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);

      const receipt = await main();

      expect(receipt).toEqual({
        schema_version: 1,
        repository_full_name: REPOSITORY,
        protected_main_sha: MAIN_SHA,
        workflow_id: WORKFLOW_ID,
        workflow_path: ORPHAN_PATH,
        prior_state: "active",
        final_state: "disabled_manually",
        mutation: "disable",
        post_audit_status: "PASS",
        remaining_failure_codes: [],
        remaining_active_orphan_ids: [],
      });
      expect(workflowState).toBe("disabled_manually");
      expect(fetchImpl.mock.calls.filter(([, options]) => options?.method === "PUT")).toHaveLength(1);
      expect(consoleLog).toHaveBeenCalledTimes(1);
      expect(String(consoleLog.mock.calls[0]?.[0] ?? "")).toContain('"final_state": "disabled_manually"');
    } finally {
      process.argv = originalArgv;
      await rm(directory, { recursive: true, force: true });
    }
  });
});
