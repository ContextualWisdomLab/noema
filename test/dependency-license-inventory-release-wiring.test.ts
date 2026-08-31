import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runAcquisitionAudit } from "../scripts/acquisition-audit.mjs";

describe("release dependency-license evidence wiring", () => {
  it.each(["release:verify", "release:verify:strict"])(
    "%s generates the exact lockfile inventory before acquisition manifest materialization",
    (scriptName) => {
      const packageJson = JSON.parse(
        readFileSync(new URL("../package.json", import.meta.url), "utf8"),
      );
      const script = packageJson.scripts[scriptName];

      expect(script).toContain("npm run release:dependency-license-inventory");
      expect(
        script.indexOf("npm run release:dependency-license-inventory"),
      ).toBeLessThan(script.indexOf("npm run acquisition:manifest"));
    },
  );

  it("acquisition:audit refreshes the manifest exactly once after deterministic license evidence and before integrity verification", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    );
    expect(packageJson.scripts["acquisition:audit"]).toBe(
      "node scripts/acquisition-audit.mjs",
    );
  });

  it("direct execution resolves npm CLI and propagates a failed stage status", () => {
    const root = fileURLToPath(new URL("..", import.meta.url));
    const temp = mkdtempSync(join(tmpdir(), "noema-acquisition-audit-spawn-"));
    const failingNpm = join(temp, "npm-cli.cjs");
    try {
      writeFileSync(failingNpm, "process.exit(7);\n", { mode: 0o600 });
      const result = spawnSync(process.execPath, ["scripts/acquisition-audit.mjs"], {
        cwd: root,
        env: { ...process.env, npm_execpath: failingNpm },
        encoding: "utf8",
        timeout: 10_000,
      });

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(7);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("canonicalizes an uppercase exact revision before binding every stage", () => {
    const calls: Array<{ env: NodeJS.ProcessEnv }> = [];
    runAcquisitionAudit({
      cwd: "/repo",
      revision: "A".repeat(64),
      env: { npm_execpath: "npm-cli.js" },
      spawn: (_command, _args, options) => {
        calls.push({ env: options.env });
      },
    });

    expect(calls).toHaveLength(5);
    expect(calls.every(({ env }) =>
      env.NOEMA_DATA_ROOM_SOURCE_COMMIT === "a".repeat(64)
      && env.NOEMA_DATA_ROOM_OUTPUT_DIR?.endsWith("/" + "a".repeat(64))
    )).toBe(true);
  });

  it("stops before the next stage when the live source revision moves", () => {
    const originalRevision = "a".repeat(40);
    const movedRevision = "b".repeat(40);
    const observedRevisions = [originalRevision, originalRevision, movedRevision];
    const calls: Array<{ args: string[] }> = [];

    expect(() => runAcquisitionAudit({
      cwd: "/repo",
      env: { npm_execpath: "npm-cli.js" },
      resolveRevision: () => observedRevisions.shift() ?? movedRevision,
      spawn: (_command, args) => {
        calls.push({ args });
      },
    })).toThrow("acquisition audit source revision changed during execution");

    expect(calls.map(({ args }) => args.slice(-2).join(" "))).toEqual([
      "run release:dependency-license-inventory",
    ]);
  });

  it("stops after a stage mutates tracked source without moving HEAD", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-acquisition-audit-drift-"));
    const trackedPath = join(temp, "tracked.txt");
    const calls: string[] = [];
    try {
      expect(spawnSync("git", ["init", "--quiet"], { cwd: temp }).status).toBe(0);
      writeFileSync(trackedPath, "original\n", "utf8");
      expect(spawnSync("git", ["add", "tracked.txt"], { cwd: temp }).status).toBe(0);
      expect(spawnSync(
        "git",
        [
          "-c", "user.name=Noema Test",
          "-c", "user.email=noema-test@example.invalid",
          "commit", "--quiet", "-m", "fixture",
        ],
        { cwd: temp },
      ).status).toBe(0);

      expect(() => runAcquisitionAudit({
        cwd: temp,
        env: { npm_execpath: "npm-cli.js" },
        spawn: (_command, args) => {
          calls.push(args.slice(-2).join(" "));
          if (calls.length === 1) {
            writeFileSync(trackedPath, "mutated\n", "utf8");
          }
        },
      })).toThrow();

      expect(calls).toEqual(["run release:dependency-license-inventory"]);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("revalidates mutated source after a nonzero stage before aborting the audit", () => {
    const temp = mkdtempSync(join(tmpdir(), "noema-acquisition-audit-failed-drift-"));
    const trackedPath = join(temp, "tracked.txt");
    const evidencePath = join(temp, "failed-stage-evidence.json");
    const calls: string[] = [];
    try {
      expect(spawnSync("git", ["init", "--quiet"], { cwd: temp }).status).toBe(0);
      writeFileSync(trackedPath, "original\n", "utf8");
      expect(spawnSync("git", ["add", "tracked.txt"], { cwd: temp }).status).toBe(0);
      expect(spawnSync(
        "git",
        [
          "-c", "user.name=Noema Test",
          "-c", "user.email=noema-test@example.invalid",
          "commit", "--quiet", "-m", "fixture",
        ],
        { cwd: temp },
      ).status).toBe(0);

      expect(() => runAcquisitionAudit({
        cwd: temp,
        env: { npm_execpath: "npm-cli.js" },
        spawn: (_command, args) => {
          calls.push(args.slice(-2).join(" "));
          writeFileSync(evidencePath, '{"status":"FAIL"}\n', "utf8");
          writeFileSync(trackedPath, "mutated\n", "utf8");
          return 7;
        },
      })).toThrow("tracked checkout differs from exact HEAD");

      expect(readFileSync(evidencePath, "utf8")).toBe('{"status":"FAIL"}\n');
      expect(calls).toEqual(["run release:dependency-license-inventory"]);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it.each([
    { dataRoomName: undefined, auditName: undefined },
    { dataRoomName: "data-room-output", auditName: undefined },
    { dataRoomName: "conflicting-data-room", auditName: "audit-output" },
  ])(
    "shares one acquisition output directory across every audit stage ($dataRoomName, $auditName)",
    ({ dataRoomName, auditName }) => {
      const root = fileURLToPath(new URL("..", import.meta.url));
      const dataRoomPath = dataRoomName
        ? join(root, dataRoomName)
        : undefined;
      const auditPath = auditName
        ? join(root, auditName)
        : undefined;
      const calls: Array<{
        command: string;
        args: string[];
        env: NodeJS.ProcessEnv;
      }> = [];
      const revision = "a".repeat(40);
      runAcquisitionAudit({
        cwd: root,
        revision,
        env: {
          npm_execpath: "npm-cli.js",
          ...(dataRoomPath ? { NOEMA_DATA_ROOM_OUTPUT_DIR: dataRoomPath } : {}),
          ...(auditPath ? { NOEMA_ACQUISITION_AUDIT_OUTPUT_DIR: auditPath } : {}),
        },
        spawn: (command, args, options) => {
          calls.push({ command, args, env: options.env });
        },
      });
      const expectedPath =
        auditPath ??
        dataRoomPath ??
        join(root, "artifacts", "acquisition-readiness", revision);
      expect(calls.every(({ command }) => command === process.execPath)).toBe(true);
      expect(calls.map(({ args }) => args.slice(-2).join(" "))).toEqual([
        "run release:dependency-license-inventory",
        "run acquisition:manifest",
        "run acquisition:integrity",
        "scripts/acquisition-readiness-audit.mjs",
        "run acquisition:deployment-evidence",
      ]);
      expect(new Set(calls.map(({ env }) =>
          `${env.NOEMA_ACQUISITION_AUDIT_OUTPUT_DIR}|${env.NOEMA_DATA_ROOM_OUTPUT_DIR}`
      ))).toEqual(new Set([`${expectedPath}|${expectedPath}`]));
      expect(new Set(calls.map(({ env }) => env.NOEMA_DATA_ROOM_SOURCE_COMMIT)))
        .toEqual(new Set([revision]));
    },
  );

  it("scheduled acquisition scan delegates one audit and never pre-materializes the buyer manifest", () => {
    const workflow = readFileSync(
      new URL(
        "../.github/workflows/acquisition-readiness-scan.yml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(workflow.match(/npm run acquisition:audit/g) ?? []).toHaveLength(1);
    expect(workflow).not.toContain("npm run acquisition:manifest");
  });
});
