import { describe, expect, it } from "vitest";
import { retainedRepositoryScope } from "../scripts/maintainer-app-readiness.mjs";

const repository = "ContextualWisdomLab/noema";

describe("retained Maintainer App repository scope", () => {
  it("retains the expected repository only when effective scope is exact", () => {
    expect(retainedRepositoryScope([{ full_name: repository }])).toEqual({
      accessible_repository_count: 1,
      accessible_repositories: [repository],
    });
  });

  it("retains only the count when an installation exposes unexpected repositories", () => {
    const unexpectedRepository = "ContextualWisdomLab/private-acquisition-target";

    const retained = retainedRepositoryScope([
      { full_name: repository },
      { full_name: unexpectedRepository },
    ]);

    expect(retained).toEqual({
      accessible_repository_count: 2,
      accessible_repositories: [],
    });
    expect(JSON.stringify(retained)).not.toContain(unexpectedRepository);
  });
});
