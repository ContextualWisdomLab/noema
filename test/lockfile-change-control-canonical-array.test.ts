import { describe, expect, it } from "vitest";
import { packageObjectDigest } from "../scripts/lockfile-change-control.mjs";

describe("lockfile canonical array evidence", () => {
  it("preserves array order while canonicalizing object keys inside arrays", () => {
    expect(
      packageObjectDigest({ values: [{ b: 2, a: 1 }, "second"] }),
    ).toBe(
      packageObjectDigest({ values: [{ a: 1, b: 2 }, "second"] }),
    );
    expect(
      packageObjectDigest({ values: ["first", "second"] }),
    ).not.toBe(
      packageObjectDigest({ values: ["second", "first"] }),
    );
  });
});
