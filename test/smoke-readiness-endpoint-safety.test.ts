import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const servers: Server[] = [];
const temporaryDirectories: string[] = [];
const bashBin = process.platform === "win32" && existsSync("C:\\Program Files\\Git\\bin\\bash.exe")
  ? "C:\\Program Files\\Git\\bin\\bash.exe"
  : "bash";
const hasSmokeTooling = ["bash", "curl", "jq", "node"].every((command) => (
  spawnSync(bashBin, ["-lc", `command -v ${command}`], {
    encoding: "utf8",
    timeout: 5000,
  }).status === 0
));
const describeSmoke = hasSmokeTooling ? describe : describe.skip;

async function startReadyServer(): Promise<string> {
  const server = createServer((request, response) => {
    request.resume();
    const headers = {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      pragma: "no-cache",
      "x-content-type-options": "nosniff",
      "x-trace-id": "trace-smoke-safety",
      "x-latency-ms": "1",
      connection: "close",
    };
    if (request.url === "/health") {
      response.writeHead(200, headers);
      response.end(JSON.stringify({ ok: true, data: { name: "noema" }, trace_id: "trace-smoke-safety" }));
      return;
    }
    if (request.url === "/ready") {
      response.writeHead(200, { ...headers, "x-noema-readiness": "ready" });
      response.end(JSON.stringify({
        ok: true,
        data: { name: "noema", status: "ready", checks: { configuration: "pass" } },
        trace_id: "trace-smoke-safety",
      }));
      return;
    }
    if (request.url === "/exchange" && request.method === "POST") {
      response.writeHead(401, {
        ...headers,
        "www-authenticate": 'Bearer realm="noema", error="invalid_request"',
      });
      response.end(JSON.stringify({ ok: false, error_code: "ERR_AUTH_MISSING", trace_id: "trace-smoke-safety" }));
      return;
    }
    response.writeHead(404, headers);
    response.end("{}");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected TCP server address");
  return `http://127.0.0.1:${address.port}`;
}

function runSmoke(
  exchangeUrl: string,
  evidencePath?: string,
): Promise<{ status: number | null; output: string }> {
  const child = spawn(bashBin, ["scripts/smoke-readiness.sh"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NOEMA_EXCHANGE_URL: exchangeUrl,
      ...(evidencePath ? { NOEMA_SMOKE_EVIDENCE_PATH: evidencePath } : {}),
    },
  });
  let output = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`smoke script timed out\n${output}`));
    }, 5000);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status, output });
    });
  });
}

describeSmoke("smoke evidence endpoint safety", () => {
  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    })));
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each([
    "/exchange/",
    "/exchange?tenant=%22buyer%22",
    "/not-exchange",
  ])("rejects non-exact exchange endpoint %s", async (suffix) => {
    const baseUrl = await startReadyServer();

    const result = await runSmoke(`${baseUrl}${suffix}`);

    expect(result.status).not.toBe(0);
    expect(result.output).toContain(
      "NOEMA_EXCHANGE_URL must be an exact deployed /exchange endpoint",
    );
  });

  it("writes parseable evidence bound to the canonical exact endpoint", async () => {
    const baseUrl = await startReadyServer();
    const directory = mkdtempSync(join(tmpdir(), "noema-smoke-safety-"));
    temporaryDirectories.push(directory);
    const evidencePath = join(directory, "smoke-evidence.json");

    const result = await runSmoke(`${baseUrl}/exchange`, evidencePath);
    const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));

    expect(result.status).toBe(0);
    expect(evidence.noema_exchange_url).toBe(`${baseUrl}/exchange`);
    expect(evidence.checks).toHaveLength(14);
    expect(evidence.checks.every((check: unknown) => (
      typeof check === "object" && check !== null
    ))).toBe(true);
  });
});
