import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const DISMISSAL_AUTHORITY =
  "exact-head review가 `DISMISSED`이면 이전 Noema decision authority를 즉시 취소합니다";
const NO_FALLBACK_AUTHORITY =
  "이전 approval로 fallback하지 않으며";

function hasDismissalAuthority(guide: string) {
  return guide.includes(DISMISSAL_AUTHORITY) && guide.includes(NO_FALLBACK_AUTHORITY);
}

describe("commercial-readiness dismissed-review operator contract", () => {
  it("documents DISMISSED as revocation rather than an ignorable incompatible state", () => {
    const guide = readFileSync("docs/hourly-commercial-readiness-loop.md", "utf8");

    expect(hasDismissalAuthority(guide)).toBe(true);
  });

  it("fails when either revocation or no-fallback authority is removed", () => {
    const guide = readFileSync("docs/hourly-commercial-readiness-loop.md", "utf8");

    expect(hasDismissalAuthority(guide.replace(DISMISSAL_AUTHORITY, ""))).toBe(false);
    expect(hasDismissalAuthority(guide.replace(NO_FALLBACK_AUTHORITY, ""))).toBe(false);
  });
});
