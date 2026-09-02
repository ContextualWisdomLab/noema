import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { runVerifyOrchestratorGatewayCli } from "../scripts/verify-orchestrator-gateway.mjs";

const roots: string[] = [];
afterEach(() => {
  while (roots.length > 0) {
    rmSync(roots.pop()!, { recursive: true, force: true });
  }
});

function eventFile(visibility: "public" | "private" | "internal"): string {
  const root = mkdtempSync(join(tmpdir(), "noema-opencode-visibility-"));
  roots.push(root);
  const path = join(root, "event.json");
  writeFileSync(path, JSON.stringify({ repository: { visibility } }), "utf8");
  return path;
}

describe("OpenCode repository visibility authority", () => {
  for (const visibility of ["private", "internal"] as const) {
    it(`fails closed for ${visibility} before gateway I/O`, async () => {
      let fetchCalls = 0;
      const stderr: string[] = [];
      const exitCode = await runVerifyOrchestratorGatewayCli({
        argv: ["--write-opencode-config", join(tmpdir(), "must-not-exist.json")],
        env: {
          GITHUB_EVENT_PATH: eventFile(visibility),
          NOEMA_LLM_API_URL: "http://127.0.0.1:18080/v1",
          NOEMA_LLM_MODEL: "orchestrator/free",
        },
        fetchImpl: async () => {
          fetchCalls += 1;
          throw new Error("gateway I/O must be unreachable");
        },
        writeStdout: () => undefined,
        writeStderr: (message: string) => stderr.push(message),
      });

      expect(exitCode).toBe(1);
      expect(fetchCalls).toBe(0);
      expect(stderr.join("\n")).toContain(
        `OpenCode inference fails closed for ${visibility} repositories until request-level zdr_only is proved`,
      );
    });
  }

  it("fails closed when event visibility is unavailable", async () => {
    let fetchCalls = 0;
    const stderr: string[] = [];
    const exitCode = await runVerifyOrchestratorGatewayCli({
      argv: ["--write-opencode-config", join(tmpdir(), "must-not-exist.json")],
      env: {
        NOEMA_LLM_API_URL: "http://127.0.0.1:18080/v1",
        NOEMA_LLM_MODEL: "orchestrator/free",
      },
      fetchImpl: async () => {
        fetchCalls += 1;
        throw new Error("gateway I/O must be unreachable");
      },
      writeStdout: () => undefined,
      writeStderr: (message: string) => stderr.push(message),
    });

    expect(exitCode).toBe(1);
    expect(fetchCalls).toBe(0);
    expect(stderr.join("\n")).toContain(
      "OpenCode routing requires GITHUB_EVENT_PATH repository visibility",
    );
  });
});
