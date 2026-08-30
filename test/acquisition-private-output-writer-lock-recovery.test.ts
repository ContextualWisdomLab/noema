import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

type LockFailureStage = "open" | "fstat" | "close";

async function loadWriterWithSingleLockFailure(
  stage: LockFailureStage,
  options: {
    removeLockAfterFstatFailure?: boolean;
    replaceLockAfterFstatFailure?: boolean;
  } = {},
) {
  vi.resetModules();
  let injected = false;
  let observedLockPath: string | null = null;
  const lockDescriptors = new Set<number>();
  const lockPathsByDescriptor = new Map<number, string>();

  vi.doMock("node:fs", async () => {
    const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
    return {
      ...actual,
      openSync(path: Parameters<typeof actual.openSync>[0], flags: number, mode?: number) {
        const pathText = String(path);
        const isLockPath = pathText.includes(".noema-acquisition-writer-");
        if (isLockPath && stage === "open" && !injected) {
          injected = true;
          throw new Error("synthetic writer lock open failure");
        }
        const descriptor = actual.openSync(path, flags, mode);
        if (isLockPath) {
          observedLockPath = pathText;
          lockDescriptors.add(descriptor);
          lockPathsByDescriptor.set(descriptor, pathText);
        }
        return descriptor;
      },
      fstatSync(descriptor: number) {
        if (lockDescriptors.has(descriptor) && stage === "fstat" && !injected) {
          injected = true;
          if (options.removeLockAfterFstatFailure || options.replaceLockAfterFstatFailure) {
            const lockPath = lockPathsByDescriptor.get(descriptor);
            if (!lockPath) throw new Error("missing synthetic writer lock path");
            actual.unlinkSync(lockPath);
            if (options.replaceLockAfterFstatFailure) {
              actual.writeFileSync(lockPath, "foreign-lock\n", { encoding: "utf8", mode: 0o600 });
            }
          }
          throw new Error("synthetic writer lock fstat failure");
        }
        return actual.fstatSync(descriptor);
      },
      closeSync(descriptor: number) {
        if (lockDescriptors.has(descriptor) && stage === "close" && !injected) {
          injected = true;
          lockDescriptors.delete(descriptor);
          lockPathsByDescriptor.delete(descriptor);
          actual.closeSync(descriptor);
          throw new Error("synthetic writer lock close failure");
        }
        lockDescriptors.delete(descriptor);
        lockPathsByDescriptor.delete(descriptor);
        return actual.closeSync(descriptor);
      },
    };
  });

  const writerModule = await import("../scripts/lib/acquisition-private-output.mjs");
  return { writerModule, getObservedLockPath: () => observedLockPath };
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
          const { writerModule } = await loadWriterWithSingleLockFailure(stage);
          const { writeAcquisitionPrivateFile } = writerModule;

          expect(() => writeAcquisitionPrivateFile(output, "rejected-attempt\n")).toThrow(expectedError);
          expect(() => writeAcquisitionPrivateFile(output, "accepted-after-retry\n")).not.toThrow();
          expect(readFileSync(output, "utf8")).toBe("accepted-after-retry\n");
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      },
    );

    it("recovers when the failed lock pathname disappears before identity recovery", async () => {
      const root = mkdtempSync(join(tmpdir(), "noema-writer-lock-removed-"));
      const output = join(root, "evidence.json");
      try {
        const { writerModule } = await loadWriterWithSingleLockFailure(
          "fstat",
          { removeLockAfterFstatFailure: true },
        );
        const { writeAcquisitionPrivateFile } = writerModule;

        expect(() => writeAcquisitionPrivateFile(output, "rejected-attempt\n")).toThrow(
          "synthetic writer lock fstat failure",
        );
        expect(() => writeAcquisitionPrivateFile(output, "accepted-after-vanished-lock\n")).not.toThrow();
        expect(readFileSync(output, "utf8")).toBe("accepted-after-vanished-lock\n");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it("does not unlink a replacement lock inode while releasing poisoned in-process authority", async () => {
      const root = mkdtempSync(join(tmpdir(), "noema-writer-lock-replaced-"));
      const output = join(root, "evidence.json");
      try {
        const { writerModule, getObservedLockPath } = await loadWriterWithSingleLockFailure(
          "fstat",
          { replaceLockAfterFstatFailure: true },
        );
        const { writeAcquisitionPrivateFile } = writerModule;

        expect(() => writeAcquisitionPrivateFile(output, "rejected-attempt\n")).toThrow(
          "synthetic writer lock fstat failure",
        );
        const lockPath = getObservedLockPath();
        expect(lockPath).not.toBeNull();
        expect(readFileSync(lockPath as string, "utf8")).toBe("foreign-lock\n");

        let retryError: unknown;
        try {
          writeAcquisitionPrivateFile(output, "must-not-overwrite-foreign-lock\n");
        } catch (error) {
          retryError = error;
        }
        expect(retryError).toBeInstanceOf(Error);
        expect((retryError as Error).message).not.toMatch(/writer already active/i);
        expect(readFileSync(lockPath as string, "utf8")).toBe("foreign-lock\n");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  },
);
