import { describe, expect, it, vi } from "vitest";
import {
  createFailClosedFetch,
  type FetchLike,
} from "../src/outbound-fetch-policy";

describe("credential egress operation authority", () => {
  it("rejects bearer credential forwarding to the unused app-installations listing", async () => {
    const rawFetch = vi.fn<FetchLike>(async () => Response.json({ installations: [] }));
    const wrapped = createFailClosedFetch(rawFetch);

    const response = await wrapped("https://api.github.com/app/installations", {
      method: "GET",
      headers: { authorization: "Bearer sensitive" },
    });

    expect(response.status).toBe(502);
    expect(response.headers.get("x-noema-egress-policy")).toBe("blocked-request-policy");
    expect(rawFetch).not.toHaveBeenCalled();
  });
});
