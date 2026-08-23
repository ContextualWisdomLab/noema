import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  main,
  runIfDirect,
  startCli,
} from "../scripts/dependency-license-inventory.mjs";

const inventory = {
  schema_version: 1,
  source: {
    path: "package-lock.json",
    sha256: "a".repeat(64),
    lockfile_version: 3,
  },
  packages: [{ name: "alpha" }],
};

const originalLockPath = process.env.NOEMA_DEPENDENCY_LICENSE_LOCK_PATH;
const originalOutputPath = process.env.NOEMA_DEPENDENCY_LICENSE_OUTPUT_PATH;
const originalExitCode = process.exitCode;
const temporaryRoots: string[] = [];

function restoreEnvironmentVariable(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function validLockfile() {
  return {
    name: "noema",
    version: "0.1.0",
    lockfileVersion: 3,
    packages: {
      "": { name: "noema", version: "0.1.0" },
      "node_modules/alpha": {
        version: "1.0.0",
        license: "MIT",
        resolved: "https://registry.npmjs.org/alpha/-/alpha-1.0.0.tgz",
        integrity: "sha512-alpha",
      },
    },
  };
}

afterEach(() => {
  restoreEnvironmentVariable(
    "NOEMA_DEPENDENCY_LICENSE_LOCK_PATH",
    originalLockPath,
  );
  restoreEnvironmentVariable(
    "NOEMA_DEPENDENCY_LICENSE_OUTPUT_PATH",
    originalOutputPath,
  );
  process.exitCode = originalExitCode;
  while (temporaryRoots.length > 0) {
    const root = temporaryRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

describe("dependency license inventory CLI", () => {
  it("passes explicit non-secret path configuration through one injected generation boundary", () => {
    const generateInventory = vi.fn(() => inventory);
    const writeOutput = vi.fn();

    const result = main({
      env: {
        NOEMA_DEPENDENCY_LICENSE_LOCK_PATH: "fixtures/custom-lock.json",
        NOEMA_DEPENDENCY_LICENSE_OUTPUT_PATH: "artifacts/custom/licenses.json",
      },
      generate_inventory: generateInventory,
      write_output: writeOutput,
    });

    expect(result).toBe(inventory);
    expect(generateInventory).toHaveBeenCalledWith({
      lockPath: "fixtures/custom-lock.json",
      outputPath: "artifacts/custom/licenses.json",
    });
    expect(writeOutput).toHaveBeenCalledWith(
      "dependency license inventory: 1 packages -> artifacts/custom/licenses.json\n",
    );
  });

  it("uses canonical repository paths when no path override is present", () => {
    const generateInventory = vi.fn(() => inventory);
    const writeOutput = vi.fn();

    main({ env: {}, generate_inventory: generateInventory, write_output: writeOutput });

    expect(generateInventory).toHaveBeenCalledWith({
      lockPath: "package-lock.json",
      outputPath: "artifacts/release/dependency-licenses.json",
    });
  });

  it("exercises the default generator, environment, and stdout boundaries without network access", () => {
    const root = mkdtempSync(join(tmpdir(), "noema-license-cli-"));
    temporaryRoots.push(root);
    const lockPath = join(root, "package-lock.json");
    const outputPath = join(root, "dependency-licenses.json");
    writeFileSync(lockPath, `${JSON.stringify(validLockfile(), null, 2)}\n`, "utf8");
    process.env.NOEMA_DEPENDENCY_LICENSE_LOCK_PATH = lockPath;
    process.env.NOEMA_DEPENDENCY_LICENSE_OUTPUT_PATH = outputPath;
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const result = main();

    expect(result.source.path).toBe(lockPath);
    expect(existsSync(outputPath)).toBe(true);
    expect(stdout).toHaveBeenCalledWith(
      `dependency license inventory: 1 packages -> ${outputPath}\n`,
    );
  });

  it("tests direct-entry dispatch independently from CLI error handling", () => {
    const execute = vi.fn();
    expect(runIfDirect("file:///tmp/a.mjs", ["node"], execute)).toBe(false);
    expect(runIfDirect("file:///tmp/a.mjs", ["node", "/tmp/b.mjs"], execute)).toBe(false);
    expect(
      runIfDirect(pathToFileURL(resolve("/tmp/a.mjs")).href, ["node", "/tmp/a.mjs"], execute),
    ).toBe(true);
    expect(execute).toHaveBeenCalledOnce();
  });

  it("returns successful CLI execution and converts injected failures into nonzero status", () => {
    const success = vi.fn(() => inventory);
    expect(startCli({ execute: success })).toBe(inventory);

    const writeError = vi.fn();
    const setExitCode = vi.fn();
    expect(
      startCli({
        execute: () => {
          throw new Error("bad failure");
        },
        write_error: writeError,
        set_exit_code: setExitCode,
      }),
    ).toBeUndefined();
    expect(writeError).toHaveBeenCalledWith(
      "dependency license inventory failed: bad failure\n",
    );
    expect(setExitCode).toHaveBeenCalledWith(1);

    writeError.mockClear();
    expect(
      startCli({
        execute: () => {
          throw "string failure";
        },
        write_error: writeError,
        set_exit_code: setExitCode,
      }),
    ).toBeUndefined();
    expect(writeError).toHaveBeenCalledWith(
      "dependency license inventory failed: string failure\n",
    );
  });

  it("uses default CLI error and exit-code boundaries on a real local input failure", () => {
    const root = mkdtempSync(join(tmpdir(), "noema-license-cli-fail-"));
    temporaryRoots.push(root);
    process.env.NOEMA_DEPENDENCY_LICENSE_LOCK_PATH = join(root, "missing-lock.json");
    process.env.NOEMA_DEPENDENCY_LICENSE_OUTPUT_PATH = join(root, "output.json");
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    expect(startCli()).toBeUndefined();

    expect(process.exitCode).toBe(1);
    expect(stderr).toHaveBeenCalledOnce();
    expect(String(stderr.mock.calls[0][0])).toContain(
      "dependency license inventory failed:",
    );
  });
});