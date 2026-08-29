import { describe, expect, it, vi } from "vitest";
import {
  createFailClosedFetch,
  type FetchLike,
} from "../src/outbound-fetch-policy";

describe("credential-egress caller cancellation authority", () => {
  it("never enters the raw transport when the caller signal is already aborted", async () => {
    const rawFetch = vi.fn<FetchLike>(async () => new Response("unexpected transport"));
    const wrapped = createFailClosedFetch(rawFetch);
    const caller = new AbortController();
    const reason = new DOMException("caller cancelled before egress", "AbortError");
    caller.abort(reason);

    await expect(wrapped(
      "https://api.github.com/repos/ContextualWisdomLab/noema/installation",
      {
        method: "GET",
        headers: { authorization: "Bearer sensitive" },
        signal: caller.signal,
      },
    )).rejects.toBe(reason);
    expect(rawFetch).not.toHaveBeenCalled();
  });
});
