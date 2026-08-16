import { describe, expect, it, vi } from "vitest";
import {
  runIfDirect,
  startCli,
} from "../scripts/workflow-registry-live-disable.mjs";

describe("workflow registry live-disable CLI boundary", () => {
  it("does not start when argv has no executable target", () => {
    const starter = vi.fn();
    const invoked = runIfDirect({
      scriptUrl: "file:///operator.mjs",
      argv: ["node"],
      pathToFileUrlFn: vi.fn(),
      starter,
    });

    expect(invoked).toBe(false);
    expect(starter).not.toHaveBeenCalled();
  });

  it("does not start when the resolved invocation URL is a different module", () => {
    const starter = vi.fn();
    const pathToFileUrlFn = vi.fn(() => ({ href: "file:///different.mjs" }));
    const invoked = runIfDirect({
      scriptUrl: "file:///operator.mjs",
      argv: ["node", "/tmp/operator.mjs"],
      pathToFileUrlFn,
      starter,
    });

    expect(invoked).toBe(false);
    expect(pathToFileUrlFn).toHaveBeenCalledWith("/tmp/operator.mjs");
    expect(starter).not.toHaveBeenCalled();
  });

  it("starts exactly once when the resolved invocation URL matches", () => {
    const starter = vi.fn();
    const invoked = runIfDirect({
      scriptUrl: "file:///operator.mjs",
      argv: ["node", "/tmp/operator.mjs"],
      pathToFileUrlFn: vi.fn(() => ({ href: "file:///operator.mjs" })),
      starter,
    });

    expect(invoked).toBe(true);
    expect(starter).toHaveBeenCalledTimes(1);
  });

  it("leaves exit state untouched after a successful CLI operation", async () => {
    const stderr = vi.fn();
    const setExitCode = vi.fn();
    const mainFn = vi.fn(async () => ({ status: "PASS" }));

    await startCli({ mainFn, stderr, setExitCode });

    expect(mainFn).toHaveBeenCalledTimes(1);
    expect(stderr).not.toHaveBeenCalled();
    expect(setExitCode).not.toHaveBeenCalled();
  });

  it("bounds and redacts a failed CLI operation before setting exit code", async () => {
    const stderr = vi.fn();
    const setExitCode = vi.fn();
    const mainFn = vi.fn(async () => {
      throw new Error(`delegated token ghp_${"A".repeat(80)} was rejected`);
    });

    await startCli({ mainFn, stderr, setExitCode });

    expect(setExitCode).toHaveBeenCalledTimes(1);
    expect(setExitCode).toHaveBeenCalledWith(1);
    expect(stderr).toHaveBeenCalledTimes(1);
    const emitted = String(stderr.mock.calls[0]?.[0] ?? "");
    expect(emitted).toContain("workflow-registry-disable failed:");
    expect(emitted).toContain("[REDACTED]");
    expect(emitted).not.toContain("ghp_");
  });

  it("redacts a fine-grained GitHub PAT from failed CLI diagnostics", async () => {
    const stderr = vi.fn();
    const setExitCode = vi.fn();
    const fineGrainedPat = `github_pat_${"B".repeat(82)}`;
    const mainFn = vi.fn(async () => {
      throw new Error(`delegated token ${fineGrainedPat} was rejected`);
    });

    await startCli({ mainFn, stderr, setExitCode });

    expect(setExitCode).toHaveBeenCalledWith(1);
    expect(stderr).toHaveBeenCalledTimes(1);
    const emitted = String(stderr.mock.calls[0]?.[0] ?? "");
    expect(emitted).toContain("[REDACTED]");
    expect(emitted).not.toContain("github_pat_");
    expect(emitted).not.toContain(fineGrainedPat);
  });
});
