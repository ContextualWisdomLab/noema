import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const document = (path: string): string => readFileSync(path, "utf8");
const historicalBaseline = (): string => document("docs/history/product-technical-gap-baseline-20260921.md");

const section = (source: string, heading: string): string => {
  const lines = source.split("\n");
  const start = lines.indexOf(heading);
  if (start < 0) {
    throw new Error(`Missing documentation section: ${heading}`);
  }
  const headingMatch = /^(#+)\s/u.exec(heading);
  if (!headingMatch) {
    throw new Error(`Invalid documentation heading: ${heading}`);
  }
  const level = headingMatch[1].length;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const nextHeading = /^(#+)\s/u.exec(lines[index]);
    if (nextHeading && nextHeading[1].length <= level) {
      end = index;
      break;
    }
  }
  return lines.slice(start + 1, end).join("\n");
};

const documentationBlocksContaining = (source: string, marker: string): string[] => {
  const lines = source.split("\n");
  const blocks: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].includes(marker)) continue;

    if (lines[index].trimStart().startsWith("|")) {
      blocks.push(lines[index].replace(/\s+/gu, " ").trim());
      continue;
    }

    let start = index;
    while (start > 0 && lines[start - 1].trim() !== "") start -= 1;

    let end = index + 1;
    while (end < lines.length && lines[end].trim() !== "") end += 1;

    const block = lines.slice(start, end).join("\n").replace(/\s+/gu, " ").trim();
    if (!blocks.includes(block)) blocks.push(block);
  }

  return blocks;
};

describe("protected procedural documentation authority", () => {
  it("classifies the merged workflow-backed current-state ACL as protected source", () => {
    const architecture = document("ARCHITECTURE.md");
    const prd = document("docs/PRD.md");
    const trd = document("docs/TRD.md");
    const baseline = document("docs/product-technical-gap-baseline.md");
    const adoption = document("docs/doctoring/procedural_graph_adoption.md");

    for (const currentDocument of [architecture, prd, trd, baseline, adoption]) {
      expect(currentDocument).not.toContain("On this active branch");
      expect(currentDocument).not.toContain("Draft #589");
      expect(currentDocument).not.toContain("candidate #589");
      expect(currentDocument).not.toContain("tracked in #589 until its own protected integration");
    }

    expect(architecture).toContain("Protected source `src/agent-runtime/procedural-current-lifecycle.ts`");
    expect(prd).toContain("Protected source includes the #589 workflow-backed current-state ACL");
    expect(trd).toContain("Protected source reuses the Workflow / Task Execution Durable Object only as current task/cancellation evidence for procedural guidance");
    expect(baseline).toContain("protected #585/#586/#589");
    expect(adoption).toContain("#585, #586, and #589 are merged on protected `main`");
  });

  it("records the protected current-state response bound without promoting deployment authority", () => {
    const changelog = document("CHANGELOG.md");
    const adr = document("docs/adr/0017-procedural-graph-guidance.md");
    const baseline = historicalBaseline();

    expect(changelog).toContain("PR #652");
    expect(changelog).toContain("1 MiB retained-byte ceiling");
    expect(adr).toContain("Protected #652 bounds that private response to a 1 MiB retained-byte ceiling");
    expect(baseline).toContain("#603 + #652");
    expect(baseline).toContain("fixed 1 MiB retained buffer");

    for (const currentDocument of [adr, baseline]) {
      expect(currentDocument).toMatch(/ADR-0017|ADR 0017/u);
      expect(currentDocument).toContain("Proposed");
    }
  });

  it("classifies durable procedural evaluation history as protected State / Checkpoint source", () => {
    const adoption = document("docs/doctoring/procedural_graph_adoption.md");

    expect(adoption).toContain("#597 is merged on protected `main`");
    expect(adoption).toContain("#714 is merged on protected `main`");
    expect(adoption).toContain("bounded durable evaluation/rejection history");
    expect(adoption).toContain("Policy / Approval remains a separate bounded-context authority");
    expect(adoption).not.toContain("Reuse existing execution/state authorities before adding persistence");
    expect(adoption).not.toContain("There is no production graph/trajectory store, signed receipt verifier");
  });

  it("keeps ADR-0017 aligned with protected signed-evaluation and State / Checkpoint authority", () => {
    const adr = document("docs/adr/0017-procedural-graph-guidance.md");

    expect(adr).toContain("Protected #597 adds bounded durable evaluation/rejection history");
    expect(adr).toContain("Protected #714 hardens that same State / Checkpoint");
    expect(adr).toContain("Protected #599 adds a provenance-preserving verified read boundary");
    expect(adr).toContain("#601 adds the Noema Policy / Approval CAS boundary");
    expect(adr).not.toContain("later State/Checkpoint adapter owns authenticated retention");
    expect(adr).not.toContain("durable graph/rejection history and promotion/revocation remain separate work");
    expect(adr).not.toContain("There is still no production graph/trajectory store, signed receipt verifier");
  });

  it("pins protected #714 minimal-transaction authority to local procedural-history sections", () => {
    const adrSection = section(
      document("docs/adr/0017-procedural-graph-guidance.md"),
      "## Offline evidence screening",
    );
    const trdSection = section(
      document("docs/TRD.md"),
      "### 2.4 Protected procedural graph advisory runtime",
    );
    const baselineSection = section(
      historicalBaseline(),
      "## Protected procedural graph advisory source — issue #584 / merged #585 + #586 + #589 + #597 + #601 + #603 + #652 + #663 + #678 + #714 + #719",
    );
    const adoptionSection = section(
      document("docs/doctoring/procedural_graph_adoption.md"),
      "## CWL decisions, not claims made by the paper",
    );

    for (const currentSection of [adrSection, trdSection, baselineSection, adoptionSection]) {
      expect(currentSection).toContain("Protected #714");
      expect(currentSection).toMatch(/before .*transaction|before the storage transaction/u);
      expect(currentSection).toMatch(
        /complete .*retained structure|complete current retained structure|complete equality with the preverified structure/u,
      );
      expect(currentSection).toMatch(/handoff[- ]freshness/u);
      expect(currentSection).toMatch(/canonical lowercase 64-hex/u);
      expect(currentSection).not.toContain("activationAuthorized:true");
      expect(currentSection).not.toContain("publicationAuthorized:true");
    }
  });

  it("classifies procedural Policy / Approval CAS as protected source without granting activation", () => {
    const adoption = document("docs/doctoring/procedural_graph_adoption.md");
    const adr = document("docs/adr/0017-procedural-graph-guidance.md");

    for (const currentDocument of [adoption, adr]) {
      expect(currentDocument).toContain("#601");
      expect(currentDocument).toContain("Policy / Approval");
      expect(currentDocument).toContain("activationAuthorized:false");
      expect(currentDocument).not.toContain("independently approved graph promotion/revocation API");
      expect(currentDocument).not.toContain("independently approved promotion API");
    }

    expect(adoption).toContain("#601 is merged on protected `main`");
    expect(adoption).toContain("monotonic approval-version CAS");
    expect(adoption).toContain("explicit revocation");
    expect(adr).toContain("#601 adds the Noema Policy / Approval CAS boundary");
  });

  it("pins protected #719 Policy / Approval transaction authority across canonical procedural sections", () => {
    const adrSection = section(
      document("docs/adr/0017-procedural-graph-guidance.md"),
      "## Offline evidence screening",
    );
    const architectureSection = section(
      document("ARCHITECTURE.md"),
      "### 4.1 Protected procedural graph guidance",
    );
    const trdSection = section(
      document("docs/TRD.md"),
      "### 2.4 Protected procedural graph advisory runtime",
    );
    const baselineSection = section(
      historicalBaseline(),
      "## Protected procedural graph advisory source — issue #584 / merged #585 + #586 + #589 + #597 + #601 + #603 + #652 + #663 + #678 + #714 + #719",
    );
    const adoptionSection = section(
      document("docs/doctoring/procedural_graph_adoption.md"),
      "## CWL decisions, not claims made by the paper",
    );
    const traceabilitySection = section(
      document("docs/TRACEABILITY.md"),
      "## 13. Procedural graph advisory traceability",
    );

    for (const currentSection of [
      adrSection,
      architectureSection,
      trdSection,
      baselineSection,
      adoptionSection,
      traceabilitySection,
    ]) {
      const protected719Blocks = documentationBlocksContaining(currentSection, "#719");
      expect(protected719Blocks.length).toBeGreaterThan(0);

      const authorityBlock = protected719Blocks.find((block) => (
        /retained approval-chain (?:cryptographic )?verification/u.test(block)
        && /next-event SHA-256/u.test(block)
        && /before .*transaction|before `DurableObjectStorage\.transaction\(\)`/u.test(block)
        && /complete current retained|complete .*retained.*structure/u.test(block)
        && /canonical string|without coercion|non-coercing/u.test(block)
        && /exact replay return/u.test(block)
        && /one durable write/u.test(block)
        && /activationAuthorized:\s*false/u.test(block)
      ));

      expect(authorityBlock).toBeDefined();
      const exact719Block = authorityBlock ?? "";
      expect(exact719Block).not.toMatch(/activationAuthorized:\s*true/u);
      expect(exact719Block).not.toMatch(/publicationAuthorized:\s*true/u);
    }

    expect(adrSection).toContain("ProceduralPolicyApprovalConflictError");
    expect(baselineSection).toContain("ProceduralPolicyApprovalConflictError");
    expect(adoptionSection).toContain("ProceduralPolicyApprovalConflictError");
  });
});
