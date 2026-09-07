import { describe, expect, it } from "vitest";
import { shouldDispatchProductDevelopment } from "../scripts/hourly-commercial-readiness.mjs";

describe("work-conserving product-development admission", () => {
  it("keeps product development eligible after a healthy readiness pass even while PR lanes remain open", () => {
    expect(shouldDispatchProductDevelopment(true, 0)).toBe(true);
  });

  it("does not dispatch from dry-run or operational-error passes", () => {
    expect(shouldDispatchProductDevelopment(false, 0)).toBe(false);
    expect(shouldDispatchProductDevelopment(true, 1)).toBe(false);
  });
});
