import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithoutRedirect } from "../src/fail-closed-fetch";

describe("fail-closed outbound fetch policy", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects redirects when no request options are supplied", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 204 }),
    );

    await fetchWithoutRedirect("https://api.github.com/meta");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/meta",
      { redirect: "error" },
    );
  });

  it("overrides a caller-supplied redirect mode while preserving other options", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 204 }),
    );
    const headers = { authorization: "Bearer bounded-test-token" };

    await fetchWithoutRedirect("https://api.github.com/app", {
      method: "POST",
      headers,
      redirect: "follow",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/app",
      {
        method: "POST",
        headers,
        redirect: "error",
      },
    );
  });
});
