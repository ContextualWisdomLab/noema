import { describe, expect, it } from "vitest";
import { resolveNoFollowOpenFlags } from "../scripts/prepare-agent-pr-message.mjs";

describe("agent PR metadata no-follow capability", () => {
  it("fails closed when O_NOFOLLOW is unavailable", () => {
    expect(() => resolveNoFollowOpenFlags({
      O_RDONLY: 0x10,
      O_NOFOLLOW: undefined,
    })).toThrow("PR_MESSAGE.md requires no-follow file-open support");
  });

  it("fails closed when O_RDONLY is unavailable", () => {
    expect(() => resolveNoFollowOpenFlags({
      O_RDONLY: undefined,
      O_NOFOLLOW: 0x20,
    })).toThrow("PR_MESSAGE.md requires no-follow file-open support");
  });

  it("returns only the reviewed read-only and no-follow flags", () => {
    expect(resolveNoFollowOpenFlags({
      O_RDONLY: 0x10,
      O_NOFOLLOW: 0x20,
      O_CREAT: 0x40,
    })).toBe(0x30);
  });
});
