import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

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
    const script = packageJson.scripts["acquisition:audit"];
    const inventoryIndex = script.indexOf(
      "npm run release:dependency-license-inventory",
    );
    const manifestIndex = script.indexOf("npm run acquisition:manifest");
    const integrityIndex = script.indexOf("npm run acquisition:integrity");

    expect(inventoryIndex).toBeGreaterThanOrEqual(0);
    expect(manifestIndex).toBeGreaterThanOrEqual(0);
    expect(integrityIndex).toBeGreaterThanOrEqual(0);
    expect(inventoryIndex).toBeLessThan(manifestIndex);
    expect(manifestIndex).toBeLessThan(integrityIndex);
    expect(script.match(/npm run acquisition:manifest/g) ?? []).toHaveLength(1);
  });

  it.each([
    { dataRoomName: undefined, auditName: undefined },
    { dataRoomName: "data-room-output", auditName: undefined },
    { dataRoomName: "conflicting-data-room", auditName: "audit-output" },
  ])(
    "shares one acquisition output directory across every audit stage ($dataRoomName, $auditName)",
    ({ dataRoomName, auditName }) => {
      const root = fileURLToPath(new URL("..", import.meta.url));
      const temporaryDirectory = mkdtempSync(
        join(tmpdir(), "noema-acquisition-audit-"),
      );
      const tracePath = join(temporaryDirectory, "trace");
      const dataRoomPath = dataRoomName
        ? join(temporaryDirectory, dataRoomName)
        : undefined;
      const auditPath = auditName
        ? join(temporaryDirectory, auditName)
        : undefined;
      const packageJson = JSON.parse(
        readFileSync(join(root, "package.json"), "utf8"),
      );
      const stub = `#!/bin/sh
set -eu
printf '%s|%s\\n' "$NOEMA_ACQUISITION_AUDIT_OUTPUT_DIR" "$NOEMA_DATA_ROOM_OUTPUT_DIR" >> "$NOEMA_AUDIT_TRACE"
if [ "\${1}" = "run" ] && [ "\${2}" = "acquisition:manifest" ]; then
  mkdir -p "$NOEMA_DATA_ROOM_OUTPUT_DIR"
  : > "$NOEMA_DATA_ROOM_OUTPUT_DIR/data-room-manifest.json"
elif [ "\${1}" = "run" ]; then
  test -f "$NOEMA_ACQUISITION_AUDIT_OUTPUT_DIR/data-room-manifest.json" || [ "\${2}" = "release:dependency-license-inventory" ]
else
  test -f "$NOEMA_ACQUISITION_AUDIT_OUTPUT_DIR/data-room-manifest.json"
fi
`;
      writeFileSync(join(temporaryDirectory, "npm"), stub);
      writeFileSync(join(temporaryDirectory, "node"), stub);
      chmodSync(join(temporaryDirectory, "npm"), 0o755);
      chmodSync(join(temporaryDirectory, "node"), 0o755);

      try {
        const result = spawnSync(
          "/bin/sh",
          ["-c", packageJson.scripts["acquisition:audit"]],
          {
            cwd: root,
            encoding: "utf8",
            env: {
              PATH: `${temporaryDirectory}:${process.env.PATH ?? ""}`,
              NOEMA_AUDIT_TRACE: tracePath,
              ...(dataRoomPath
                ? { NOEMA_DATA_ROOM_OUTPUT_DIR: dataRoomPath }
                : {}),
              ...(auditPath
                ? { NOEMA_ACQUISITION_AUDIT_OUTPUT_DIR: auditPath }
                : {}),
            },
          },
        );
        expect(result.stderr).toBe("");
        expect(result.status).toBe(0);
        const observedPaths = readFileSync(tracePath, "utf8")
          .trim()
          .split("\n");
        const expectedPath =
          auditPath ??
          dataRoomPath ??
          join(
            root,
            "artifacts",
            "acquisition-readiness",
            spawnSync("git", ["rev-parse", "HEAD"], {
              cwd: root,
              encoding: "utf8",
            }).stdout.trim(),
          );
        expect(new Set(observedPaths)).toEqual(
          new Set([`${expectedPath}|${expectedPath}`]),
        );
      } finally {
        rmSync(temporaryDirectory, { recursive: true, force: true });
      }
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
