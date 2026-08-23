import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";
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

  it("tests direct-entry dispatch independently from CLI error handling", () => {
    const execute = vi.fn();
    expect(runIfDirect("file:///tmp/a.mjs", ["node"], execute)).toBe(false);
    expect(runIfDirect("file:///tmp/a.mjs", ["node", "/tmp/b.mjs"], execute)).toBe(false);
    expect(
      runIfDirect(pathToFileURL(resolve("/tmp/a.mjs")).href, ["node", "/tmp/a.mjs"], execute),
    ).toBe(true);
    expect(execute).toHaveBeenCalledOnce();
  });

  it("returns successful CLI execution and converts failures into a nonzero bounded boundary", () => {
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
});