import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const bashBin = process.platform === "win32" && existsSync("C:\\Program Files\\Git\\bin\\bash.exe")
  ? "C:\\Program Files\\Git\\bin\\bash.exe"
  : "bash";
const bashProbe = spawnSync(bashBin, ["--version"], { encoding: "utf8", timeout: 2000 });
const describeShell = bashProbe.status === 0 ? describe : describe.skip;

function runDemo(exchangeUrl: string, oidcToken = "demo-sensitive-token") {
  const temp = mkdtempSync(join(tmpdir(), "noema-demo-endpoint-"));
  const binDir = join(temp, "bin");
  const logPath = join(temp, "curl.log");
  mkdirSync(binDir);
  const fakeCurlPath = join(binDir, "curl");
  writeFileSync(fakeCurlPath, [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    'printf \'%s\\n\' "$*" >>"${NOEMA_FAKE_CURL_LOG}"',
    "exit 0",
    "",
  ].join("\n"));
  chmodSync(fakeCurlPath, 0o755);

  const result = spawnSync(bashBin, ["scripts/demo-exchange.sh"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH ?? ""}`,
      NOEMA_EXCHANGE_URL: exchangeUrl,
      NOEMA_OIDC_TOKEN: oidcToken,
      NOEMA_FAKE_CURL_LOG: logPath,
    },
    encoding: "utf8",
    timeout: 5000,
  });
  const curlLog = existsSync(logPath) ? readFileSync(logPath, "utf8") : "";
  rmSync(temp, { recursive: true, force: true });
  return { ...result, curlLog };
}

describeShell("demo exchange endpoint safety", () => {
  it("rejects non-loopback cleartext endpoints before exposing the OIDC bearer token to curl", () => {
    const result = runDemo("http://attacker.example/exchange");

    expect(result.status).not.toBe(0);
    expect(result.curlLog).not.toContain("demo-sensitive-token");
  });

  it("preserves the three-step demo for a canonical HTTPS exchange endpoint", () => {
    const result = runDemo("https://noema.example/exchange");

    expect(result.status).toBe(0);
    expect(result.curlLog).toContain("https://noema.example/health");
    expect(result.curlLog).toContain("https://noema.example/exchange");
    expect(result.curlLog).toContain("authorization: Bearer demo-sensitive-token");
  });
});
