import { describe, expect, it } from "vitest";
import { evaluateSecurityChecklistText } from "../scripts/lib/security-checklist.mjs";

describe("security validation checklist parser", () => {
  it("passes only when every checklist item is checked", () => {
    const result = evaluateSecurityChecklistText(`
# Checklist
- [x] release gate passed
- [X] secrets rotated
`);

    expect(result.passed).toBe(true);
    expect(result.total).toBe(2);
    expect(result.checked).toBe(2);
    expect(result.unchecked).toEqual([]);
  });

  it("reports unchecked checklist items", () => {
    const result = evaluateSecurityChecklistText(`
# Checklist
- [x] release gate passed
- [ ] production provenance reviewed
`);

    expect(result.passed).toBe(false);
    expect(result.total).toBe(2);
    expect(result.checked).toBe(1);
    expect(result.unchecked).toEqual(["production provenance reviewed"]);
  });
});
