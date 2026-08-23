import { describe, expect, it, vi } from "vitest";
import { readBoundedJson } from "../scripts/lib/patch-validator-image-receipts.mjs";

describe("patch-validator receipt pathname stability", () => {
  it("rejects a receipt path replaced after the verified descriptor is read", () => {
    const bytes = Buffer.from('{"value":1}');
    let lstatCalls = 0;
    const fileSystem = {
      lstatSync: vi.fn(() => {
        lstatCalls += 1;
        return {
          isFile: () => true,
          size: bytes.length,
          dev: 7,
          ino: lstatCalls === 1 ? 11 : 12,
        };
      }),
      openSync: vi.fn(() => 42),
      fstatSync: vi.fn(() => ({
        isFile: () => true,
        size: bytes.length,
        dev: 7,
        ino: 11,
      })),
      readSync: vi.fn((_descriptor, buffer, offset, length) => {
        if (offset >= bytes.length) return 0;
        const count = Math.min(length, bytes.length - offset);
        bytes.copy(buffer, offset, offset, offset + count);
        return count;
      }),
      closeSync: vi.fn(),
    };

    expect(() => readBoundedJson("/evidence/receipt.json", 64, fileSystem)).toThrow(
      /receipt path changed while it was being read/i,
    );
    expect(fileSystem.lstatSync).toHaveBeenCalledTimes(2);
    expect(fileSystem.closeSync).toHaveBeenCalledWith(42);
  });
});
