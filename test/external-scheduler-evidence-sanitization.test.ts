import { describe, expect, it } from "vitest";

import { sanitizeReportText } from "../scripts/external-scheduler-evidence-audit.mjs";

describe("external scheduler evidence report sanitization", () => {
  it("removes Unicode formatting and line-separator controls from retained diagnostics", () => {
    const hostile = "before\u202Eevil\u2066after\u2028line\u2029para";

    expect(sanitizeReportText(hostile)).toBe("beforeevilafterlinepara");
  });
});
