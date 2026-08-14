import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseGhJsonEvidence,
  startCli,
} from "../scripts/actions-runner-assignment-audit.mjs";

const originalExitCode = process.exitCode;

afterEach(() => {
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
});

describe("runner-assignment defensive production branches", () => {
  it("fails closed when the JSON runtime rejects text after structural integrity scanning", () => {
    const jsonParse = vi.spyOn(JSON, "parse").mockImplementationOnce(() => {
      throw new SyntaxError("synthetic JSON runtime failure");
    });

    expect(() => parseGhJsonEvidence(Buffer.from("123", "utf8"))).toThrow(
      "GitHub Actions evidence read returned malformed JSON.",
    );
    expect(jsonParse).toHaveBeenCalledWith("123");
  });

  it("sets the process exit code through the production default after an internal CLI failure", async () => {
    process.exitCode = undefined;
    const writeError = vi.fn();

    await expect(startCli({
      execute: async () => {
        throw new Error("synthetic internal failure");
      },
      write_error: writeError,
    })).resolves.toBeUndefined();

    expect(writeError).toHaveBeenCalledWith(
      "runner-assignment audit failed: synthetic internal failure\n",
    );
    expect(process.exitCode).toBe(2);
  });
});
