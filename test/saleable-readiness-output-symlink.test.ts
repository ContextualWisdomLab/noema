import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "..");
const scriptPath = join(repoRoot, "scripts", "saleable-readiness-audit.mjs");
const tempRoots: string[] = [];

function makeTempRoot() {
  const root = mkdtempSync(join(tmpdir(), "noema-saleable-output-"));
  tempRoots.push(root);
  return root;
}

function saleableDay() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

function installFailingNpm(root: string) {
  const binDir = join(root, "bin");
  mkdirSync(binDir, { recursive: true });
  const npmPath = join(binDir, "npm");
  writeFileSync(npmPath, "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  chmodSync(npmPath, 0o755);
  return binDir;
}

function runAudit(root: string) {
  const binDir = installFailingNpm(root);
  return spawnSync(process.execPath, [scriptPath], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH ?? ""}`,
      NOEMA_AUDIT_REPORT_ONLY: "1",
    },
  });
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("saleable-readiness audit private output boundary", () => {
  it("refuses a pre-existing goal-audit symlink without modifying its target", () => {
    const root = makeTempRoot();
    const auditFile = join(
      root,
      "artifacts",
      "saleable-readiness",
      saleableDay(),
      "goal-audit.json",
    );
    mkdirSync(dirname(auditFile), { recursive: true });
    const sentinel = join(root, "sentinel.txt");
    writeFileSync(sentinel, "sentinel\n");
    symlinkSync(sentinel, auditFile);

    const result = runAudit(root);

    expect(result.status).not.toBe(0);
    expect(readFileSync(sentinel, "utf8")).toBe("sentinel\n");
  });

  it("refuses a symlinked saleable-readiness output directory before creating buyer evidence", () => {
    const root = makeTempRoot();
    const artifactsDir = join(root, "artifacts");
    const externalDir = join(root, "external-output");
    mkdirSync(artifactsDir, { recursive: true });
    mkdirSync(externalDir, { recursive: true });
    symlinkSync(externalDir, join(artifactsDir, "saleable-readiness"));

    const result = runAudit(root);
    const redirectedAudit = join(externalDir, saleableDay(), "goal-audit.json");

    expect(result.status).not.toBe(0);
    expect(existsSync(redirectedAudit)).toBe(false);
  });
});
