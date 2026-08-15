import { describe, expect, it } from "vitest";

import {
  decodeGhOutput,
  runGh,
} from "../scripts/production-environment-governance-audit.mjs";

function failureMessage(action: () => unknown) {
  try {
    action();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected action to fail");
}

describe("production environment governance GitHub CLI UTF-8 boundary", () => {
  it("rejects malformed UTF-8 instead of replacement-decoding production evidence", () => {
    expect(() =>
      decodeGhOutput(
        Uint8Array.from([0x7b, 0x22, 0xff, 0x22, 0x7d]),
        "stdout",
      ),
    ).toThrow("GitHub CLI returned invalid UTF-8 in stdout.");
  });

  it("decodes valid UTF-8 bytes exactly", () => {
    const bytes = new TextEncoder().encode('{"name":"production"}\n');
    expect(decodeGhOutput(bytes, "stdout")).toBe('{"name":"production"}\n');
  });

  it("prefers stderr and redacts GH_TOKEN on the real runGh failure path", () => {
    const token = "read-only-secret-token";
    const message = failureMessage(() =>
      runGh(["api", "example"], {
        sourceEnvironment: { PATH: "/usr/bin:/bin", GH_TOKEN: token },
        spawnSyncImpl: () => ({
          status: 1,
          stdout: Buffer.from(`stdout exposed ${token}`, "utf8"),
          stderr: Buffer.from(`stderr exposed ${token}`, "utf8"),
        }),
      }),
    );

    expect(message).toBe("GitHub CLI failed: stderr exposed [REDACTED]");
    expect(message).not.toContain(token);
    expect(message).not.toContain("stdout exposed");
  });

  it("falls back to stdout and redacts GH_TOKEN when stderr is empty", () => {
    const token = "read-only-secret-token";
    const message = failureMessage(() =>
      runGh(["api", "example"], {
        sourceEnvironment: { PATH: "/usr/bin:/bin", GH_TOKEN: token },
        spawnSyncImpl: () => ({
          status: 1,
          stdout: Buffer.from(`stdout exposed ${token}`, "utf8"),
          stderr: Buffer.alloc(0),
        }),
      }),
    );

    expect(message).toBe("GitHub CLI failed: stdout exposed [REDACTED]");
    expect(message).not.toContain(token);
  });

  it.each([
    ["stderr", Buffer.from([0xff]), Buffer.from("valid stdout", "utf8")],
    ["stdout", Buffer.alloc(0), Buffer.from([0xff])],
  ] as const)("fails closed on malformed %s bytes from runGh", (label, stderr, stdout) => {
    expect(() =>
      runGh(["api", "example"], {
        sourceEnvironment: { PATH: "/usr/bin:/bin", GH_TOKEN: "secret" },
        spawnSyncImpl: () => ({ status: 1, stdout, stderr }),
      }),
    ).toThrow(`GitHub CLI returned invalid UTF-8 in ${label}.`);
  });
});
