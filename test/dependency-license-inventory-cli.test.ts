import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
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
  it("does not let ambient environment variables redirect release evidence paths", () => {
    const generateInventory = vi.fn(() => inventory);
    const writeOutput = vi.fn();

    const result = main({
      env: {
        NOEMA_DEPENDENCY_LICENSE_LOCK_PATH: "fixtures/untrusted-lock.json",
        NOEMA_DEPENDENCY_LICENSE_OUTPUT_PATH: "artifacts/untrusted/licenses.json",
      },
      generate_inventory: generateInventory,
      write_output: writeOutput,
    });

    expect(result).toBe(inventory);
    expect(generateInventory).toHaveBeenCalledWith({
      lockPath: "package-lock.json",
      outputPath: "artifacts/release/dependency-licenses.json",
    });
    expect(writeOutput).toHaveBeenCalledWith(
      "dependency license inventory: 1 packages -> artifacts/release/dependency-licenses.json\n",
    );
  });

  it("uses canonical repository paths when no path override is present", () => {
    const generateInventory = vi.fn(() => inventory);
    const writeOutput = vi.fn();

    main({ generate_inventory: generateInventory, write_output: writeOutput });

    expect(generateInventory).toHaveBeenCalledWith({
      lockPath: "package-lock.json",
      outputPath: "artifacts/release/dependency-licenses.json",
    });
  });

  it("uses canonical relative paths with the default generator even when ambient overrides exist", () => {
    const root = mkdtempSync(join(tmpdir(), "noema-license-cli-"));
    temporaryRoots.push(root);
    const originalDirectory = process.cwd();
    writeFileSync(
      join(root, "package-lock.json"),
      `${JSON.stringify(validLockfile(), null, 2)}\n`,
      "utf8",
    );
    process.env.NOEMA_DEPENDENCY_LICENSE_LOCK_PATH = join(root, "untrusted-lock.json");
    process.env.NOEMA_DEPENDENCY_LICENSE_OUTPUT_PATH = join(root, "untrusted-output.json");
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    try {
      process.chdir(root);
      const result = main();

      expect(result.source.path).toBe("package-lock.json");
      expect(existsSync(join(root, "artifacts", "release", "dependency-licenses.json"))).toBe(true);
      expect(existsSync(join(root, "untrusted-output.json"))).toBe(false);
      expect(stdout).toHaveBeenCalledWith(
        "dependency license inventory: 1 packages -> artifacts/release/dependency-licenses.json\n",
      );
    } finally {
      process.chdir(originalDirectory);
    }
  });

  it("refuses a symlinked canonical artifacts directory instead of writing release evidence outside the repository path", () => {
    const root = mkdtempSync(join(tmpdir(), "noema-license-cli-parent-link-"));
    temporaryRoots.push(root);
    const originalDirectory = process.cwd();
    const redirectedArtifacts = join(root, "redirected-artifacts");
    mkdirSync(redirectedArtifacts);
    symlinkSync(redirectedArtifacts, join(root, "artifacts"), "dir");
    writeFileSync(
      join(root, "package-lock.json"),
      `${JSON.stringify(validLockfile(), null, 2)}\n`,
      "utf8",
    );

    try {
      process.chdir(root);
      expect(() => main()).toThrow();
      expect(
        existsSync(
          join(redirectedArtifacts, "release", "dependency-licenses.json"),
        ),
      ).toBe(false);
    } finally {
      process.chdir(originalDirectory);
    }
  });

  it("refuses a symlinked canonical release directory after accepting a real artifacts directory", () => {
    const root = mkdtempSync(join(tmpdir(), "noema-license-cli-release-link-"));
    temporaryRoots.push(root);
    const originalDirectory = process.cwd();
    const artifacts = join(root, "artifacts");
    const redirectedRelease = join(root, "redirected-release");
    mkdirSync(artifacts);
    mkdirSync(redirectedRelease);
    symlinkSync(redirectedRelease, join(artifacts, "release"), "dir");
    writeFileSync(
      join(root, "package-lock.json"),
      `${JSON.stringify(validLockfile(), null, 2)}\n`,
      "utf8",
    );

    try {
      process.chdir(root);
      expect(() => main()).toThrow();
      expect(existsSync(join(redirectedRelease, "dependency-licenses.json"))).toBe(false);
    } finally {
      process.chdir(originalDirectory);
    }
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

  it("fails closed on a missing canonical lockfile even if an ambient alternate lock exists", () => {
    const root = mkdtempSync(join(tmpdir(), "noema-license-cli-fail-"));
    temporaryRoots.push(root);
    const originalDirectory = process.cwd();
    const alternateLock = join(root, "alternate-lock.json");
    writeFileSync(
      alternateLock,
      `${JSON.stringify(validLockfile(), null, 2)}\n`,
      "utf8",
    );
    process.env.NOEMA_DEPENDENCY_LICENSE_LOCK_PATH = alternateLock;
    process.env.NOEMA_DEPENDENCY_LICENSE_OUTPUT_PATH = join(root, "output.json");
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    try {
      process.chdir(root);
      expect(startCli()).toBeUndefined();

      expect(process.exitCode).toBe(1);
      expect(stderr).toHaveBeenCalledOnce();
      expect(String(stderr.mock.calls[0][0])).toContain(
        "dependency license inventory failed:",
      );
      expect(existsSync(join(root, "output.json"))).toBe(false);
    } finally {
      process.chdir(originalDirectory);
    }
  });
});