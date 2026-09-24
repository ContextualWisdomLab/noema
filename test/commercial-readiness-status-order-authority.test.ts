import { describe, expect, it } from "vitest";

import { latestStatuses } from "../scripts/hourly-commercial-readiness.mjs";

describe("commercial readiness commit-status order authority", () => {
  it("preserves GitHub REST reverse-chronological order when the latest status omits created_at", () => {
    const projected = latestStatuses([
      {
        id: 200,
        context: "external-status",
        state: "failure",
        created_at: null,
      },
      {
        id: 100,
        context: "external-status",
        state: "success",
        created_at: "2026-09-22T00:00:00Z",
      },
    ]);

    expect(projected).toEqual([
      { context: "external-status", state: "failure" },
    ]);
  });
});
