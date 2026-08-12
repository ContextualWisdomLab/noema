import { describe, expect, it, vi } from "vitest";
import { runLockfileChangeControl } from "../scripts/lockfile-change-control.mjs";

const BASE_SHA = "1".repeat(40);

describe("lockfile change-control diagnostics", () => {
  it("preserves the stable fail-closed result while exposing the underlying input error on stderr", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const result = runLockfileChangeControl({
        environment: {
          NOEMA_LOCKFILE_BASE_PATH: "/base-lock.json",
          NOEMA_LOCKFILE_BASE_SHA: BASE_SHA,
        },
        readText: () => {
          throw new Error("permission denied while reading lockfile evidence");
        },
      });

      expect(result).toEqual({
        passed: false,
        changedPackages: [],
        failures: ["lockfile change-control inputs must be bounded valid UTF-8 JSON"],
      });
      expect(error).toHaveBeenCalledWith(
        "lockfile change control input failure:",
        "permission denied while reading lockfile evidence",
      );
    } finally {
      error.mockRestore();
    }
  });
});
