import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("strict KPI provenance read failures", () => {
  it("distinguishes an unreadable provenance path from malformed UTF-8", () => {
    const directory = mkdtempSync(join(tmpdir(), "noema-kpi-provenance-read-"));
    try {
      const logPath = join(directory, "exchange-30d.ndjson");
      const provenancePath = join(directory, "provenance-directory");
      const evidencePath = join(directory, "evidence.json");
      writeFileSync(
        logPath,
        [
          JSON.stringify({
            event: "http_request",
            route: "/exchange",
            status_code: 200,
            latency_ms: 120,
            timestamp: "2026-06-01T00:00:00.000Z",
          }),
          JSON.stringify({
            event: "http_request",
            route: "/exchange",
            status_code: 200,
            latency_ms: 150,
            timestamp: "2026-07-01T03:00:00.000Z",
          }),
        ].join("\n") + "\n",
        "utf8",
      );
      mkdirSync(provenancePath);

      const result = spawnSync(process.execPath, ["scripts/kpi-gate.mjs", logPath], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          NOEMA_KPI_STRICT: "1",
          NOEMA_KPI_REQUIRE_WINDOW_DAYS: "30",
          NOEMA_KPI_PROVENANCE_PATH: provenancePath,
          NOEMA_KPI_EVIDENCE_PATH: evidencePath,
        },
      });

      expect(result.status).toBe(1);
      expect(result.stdout).toContain("KPI provenance file could not be read");
      expect(result.stdout).not.toContain("not valid UTF-8");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
