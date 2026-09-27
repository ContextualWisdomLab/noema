import { describe, expect, it } from "vitest";

import { latestCheckRunsBySuite } from "../scripts/hourly-commercial-readiness.mjs";

describe("commercial readiness check-suite identity", () => {
  it("does not collapse a malformed check name into the canonical check identity", () => {
    const latest = latestCheckRunsBySuite([
      {
        id: 10,
        name: " verify ",
        status: "completed",
        conclusion: "failure",
        check_suite: { id: 30 },
        app: { slug: "github-actions" },
      },
      {
        id: 11,
        name: "verify",
        status: "completed",
        conclusion: "success",
        check_suite: { id: 30 },
        app: { slug: "github-actions" },
      },
    ]);

    expect(latest).toHaveLength(2);
    expect(latest.map((check) => check.id)).toEqual(expect.arrayContaining([10, 11]));
  });

  it("does not collapse a malformed producer slug into the canonical producer identity", () => {
    const latest = latestCheckRunsBySuite([
      {
        id: 20,
        name: "verify",
        status: "completed",
        conclusion: "failure",
        check_suite: { id: 31 },
        app: { slug: " GitHub-Actions " },
      },
      {
        id: 21,
        name: "verify",
        status: "completed",
        conclusion: "success",
        check_suite: { id: 31 },
        app: { slug: "github-actions" },
      },
    ]);

    expect(latest).toHaveLength(2);
    expect(latest.map((check) => check.id)).toEqual(expect.arrayContaining([20, 21]));
  });

  it("selects the most recent retry by observed timestamps before opaque check-run ids", () => {
    const latest = latestCheckRunsBySuite([
      {
        id: 200,
        name: "verify",
        status: "completed",
        conclusion: "success",
        started_at: "2026-09-22T09:00:00Z",
        completed_at: "2026-09-22T09:01:00Z",
        check_suite: { id: 32 },
        app: { slug: "github-actions" },
      },
      {
        id: 100,
        name: "verify",
        status: "completed",
        conclusion: "failure",
        started_at: "2026-09-22T09:05:00Z",
        completed_at: "2026-09-22T09:06:00Z",
        check_suite: { id: 32 },
        app: { slug: "github-actions" },
      },
    ]);

    expect(latest).toHaveLength(1);
    expect(latest[0]?.id).toBe(100);
    expect(latest[0]?.conclusion).toBe("failure");
  });

  it("fails closed when same-suite retry chronology lacks an observable timestamp", () => {
    expect(() => latestCheckRunsBySuite([
      {
        id: 300,
        name: "verify",
        status: "completed",
        conclusion: "success",
        started_at: "2026-09-22T10:00:00Z",
        completed_at: "2026-09-22T10:01:00Z",
        check_suite: { id: 33 },
        app: { slug: "github-actions" },
      },
      {
        id: 301,
        name: "verify",
        status: "completed",
        conclusion: "failure",
        started_at: null,
        completed_at: null,
        check_suite: { id: 33 },
        app: { slug: "github-actions" },
      },
    ])).toThrow("Check run chronology metadata is incomplete for id 301.");
  });

  it("fails closed when distinct retries have identical observed chronology", () => {
    expect(() => latestCheckRunsBySuite([
      {
        id: 400,
        name: "verify",
        status: "completed",
        conclusion: "success",
        started_at: "2026-09-23T00:00:00Z",
        completed_at: "2026-09-23T00:01:00Z",
        check_suite: { id: 34 },
        app: { slug: "github-actions" },
      },
      {
        id: 401,
        name: "verify",
        status: "completed",
        conclusion: "failure",
        started_at: "2026-09-23T00:00:00Z",
        completed_at: "2026-09-23T00:01:00Z",
        check_suite: { id: 34 },
        app: { slug: "github-actions" },
      },
    ])).toThrow("Check run chronology is ambiguous for ids 400 and 401.");
  });
});
