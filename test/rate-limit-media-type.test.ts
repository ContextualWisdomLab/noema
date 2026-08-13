import { describe, expect, it } from "vitest";
import { isJsonMediaType } from "../src/rate-limit";

describe("rate limit media type", () => {
  it("accepts only application/json as the media type", () => {
    expect(isJsonMediaType("application/json")).toBe(true);
    expect(isJsonMediaType(" APPLICATION/JSON ; charset=utf-8")).toBe(true);
    expect(isJsonMediaType("text/plain; profile=application/json")).toBe(false);
    expect(isJsonMediaType(null)).toBe(false);
  });
});
