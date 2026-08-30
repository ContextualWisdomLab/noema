import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

type LockFailureStage = "open" | "fstat" | "close";

async function loadWriterWithSingleLockFailure(stage: LockFailureStage) {
  vi.resetModules();
  let injected = false;
  const lockDescriptors = new Set<number>();

  vi.doMock("node:fs", async () => {
    const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
    return {
      ...actual,
      openSync(path: Parameters<typeof actual.openSync>[0], flags: number, mode?: number) {
        const lockPath = String(path).includes(".noema-acquisition-writer-");
        if (lockPath && stage === "open" && !injected) {
          injected = true;
          throw new Error("synthetic writer lock open failure");
        }
        const descriptor = actual.openSync(path, flags, mode);
        if (lockPath) lockDescriptors.add(descriptor);
        return descriptor;
      },
      fstatSync(descriptor: number) {
        if (lockDescriptors.has(descriptor) && stage === "fstat" && !injected) {
          injected = true;
          throw new Error("synthetic writer lock fstat failure");
        }
        return actual.fstatSync(descriptor);
      },
      closeSync(descriptor: number) {
        if (lockDescriptors.has(descriptor) && stage === "close" && !injected) {
          injected = true;
          lockDescriptors.delete(descriptor);
          actual.closeSync(descriptor);
          throw new Error("synthetic writer lock close failure");
        }
        lockDescriptors.delete(descriptor);
        return actual.closeSync(descriptor);
      },
    };
  });

  return import("../scripts/lib/acquisition-private-output.mjs");
}

afterEach(() => {
  vi.doUnmock("node:fs");
  vi.resetModules();
});

describe.skipIf(process.platform === "win32")(
  "acquisition writer lock recovery",
  () => {
    it.each([
      ["open", "synthetic writer lock open failure"],
      ["fstat", "synthetic writer lock fstat failure"],
      ["close", "synthetic writer lock close failure"],
    ] as const)(
      "releases in-process writer authority after a one-shot %s failure",
      async (stage, expectedError) => {
        const root = mkdtempSync(join(tmpdir(), `noema-writer-lock-${stage}-`));
        const output = join(root, "evidence.json");
        try {
          const { writeAcquisitionPrivateFile } = await loadWriterWithSingleLockFailure(stage);

          expect(() => writeAcquisitionPrivateFile(output, "rejected-attempt\n")).toThrow(expectedError);
          expect(() => writeAcquisitionPrivateFile(output, "accepted-after-retry\n")).not.toThrow();
          expect(readFileSync(output, "utf8")).toBe("accepted-after-retry\n");
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      },
    );
  },
);
