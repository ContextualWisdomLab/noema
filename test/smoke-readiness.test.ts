import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";

const servers: Server[] = [];
const bashBin = process.platform === "win32" && existsSync("C:\\Program Files\\Git\\bin\\bash.exe")
  ? "C:\\Program Files\\Git\\bin\\bash.exe"
  : "bash";
const hasSmokeTooling = ["curl", "jq"].every((command) => (
  spawnSync(bashBin, ["-lc", `command -v ${command}`], { encoding: "utf8", timeout: 5000 }).status === 0
));
const describeSmoke = hasSmokeTooling ? describe : describe.skip;

async function startSmokeServer({
  includeSecurityHeaders,
  includeAuthChallenge = true,
}: {
  includeSecurityHeaders: boolean;
  includeAuthChallenge?: boolean;
}): Promise<string> {
  const server = createServer((request, response) => {
    request.resume();
    const headers: Record<string, string> = {
      "content-type": "application/json; charset=utf-8",
      connection: "close",
      "x-trace-id": "trace-smoke-test",
      "x-latency-ms": "1",
    };
    if (includeSecurityHeaders) {
      headers["cache-control"] = "no-store";
      headers.pragma = "no-cache";
      headers["x-content-type-options"] = "nosniff";
    }

    if (request.url === "/health") {
      response.writeHead(200, headers);
      response.end(JSON.stringify({ ok: true, data: { name: "noema" }, trace_id: "trace-smoke-test" }));
      return;
    }

    if (request.url === "/exchange" && request.method === "POST") {
      if (includeAuthChallenge) {
        headers["www-authenticate"] = 'Bearer realm="noema", error="invalid_request"';
      }
      response.writeHead(401, headers);
      response.end(JSON.stringify({ ok: false, error_code: "ERR_AUTH_MISSING", trace_id: "trace-smoke-test" }));
      return;
    }

    response.writeHead(404, headers);
    response.end(JSON.stringify({ ok: false, error_code: "ERR_VALIDATION_INPUT", trace_id: "trace-smoke-test" }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected TCP server address");
  return `http://127.0.0.1:${address.port}`;
}

function runSmoke(baseUrl: string): Promise<{ status: number | null; stdout: string; stderr: string }> {
  const child = spawn(bashBin, ["scripts/smoke-readiness.sh"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NOEMA_EXCHANGE_URL: `${baseUrl}/exchange`,
    },
  });

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`smoke script timed out\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    }, 5000);
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (status) => {
      clearTimeout(timeout);
      resolve({ status, stdout, stderr });
    });
  });
}

describeSmoke("smoke-readiness script", () => {
  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    })));
  });

  it("fails when deployed responses omit no-store security headers", async () => {
    const baseUrl = await startSmokeServer({ includeSecurityHeaders: false });

    const result = await runSmoke(baseUrl);

    expect(result.status).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toContain("security headers missing");
  });

  it("fails when exchange 401 omits the Bearer authentication challenge", async () => {
    const baseUrl = await startSmokeServer({
      includeSecurityHeaders: true,
      includeAuthChallenge: false,
    });

    const result = await runSmoke(baseUrl);

    expect(result.status).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toContain("bearer challenge missing");
  });

  it("passes when deployed responses include required schemas and security headers", async () => {
    const baseUrl = await startSmokeServer({ includeSecurityHeaders: true });

    const result = await runSmoke(baseUrl);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("\"passed\": true");
  });
});
