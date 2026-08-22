import { describe, expect, it } from "vitest";
import { createFailClosedFetch } from "../src/outbound-fetch-policy";

describe("outbound credential transport failures", () => {
  it("classifies a trusted GitHub API transport rejection as a bounded 502 response", async () => {
    const protectedFetch = createFailClosedFetch(async () => {
      throw new TypeError("synthetic network transport failure");
    });

    const response = await protectedFetch(
      "https://api.github.com/repos/ContextualWisdomLab/noema/installation",
      {
        method: "GET",
        headers: { authorization: "Bearer synthetic-app-jwt" },
      },
    );

    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-noema-egress-policy")).toBe("blocked-transport");
    await expect(response.text()).resolves.toBe("");
  });
});
