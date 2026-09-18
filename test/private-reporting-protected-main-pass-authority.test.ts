import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const PROTECTED_SOURCE = "227e746662d29dcc8fe360f055b7fdb7857c09fd";
const RUN_ID = "35319167109";
const JOB_ID = "105517517587";
const ARTIFACT_ID = "10547590954";
const ARTIFACT_DIGEST =
  "sha256:5538ae29cc4f5032a8aca79c23064b72fa1d879fba32a92fbb462f0bf601a152";
const GENERATED_AT = "2026-09-18T12:45:48.831Z";

const BROADER_AUTHORITY_SOURCE = String.raw`(?:external\s+reporter\s+visibility(?:\s+evidence)?|staffing(?:\s+(?:coverage|evidence|authority))?|notification(?:\s+(?:evidence|authority))?|private-case\s+handling(?:\s+(?:evidence|authority))?|immutable\s+release(?:\s+(?:evidence|authority))?|deployment(?:\s+(?:evidence|authority))?|production\s+KPI(?:\s+(?:evidence|authority))?|acquisition(?:\s+readiness)?(?:\s+(?:evidence|authority))?)`;
const BROADER_AUTHORITY = new RegExp(String.raw`\b${BROADER_AUTHORITY_SOURCE}\b`, "i");
const PROMOTION_PREDICATE_SOURCE = String.raw`(?:establish(?:es|ed|ing)?|provid(?:e|es|ed|ing)|prov(?:e|es|ed|ing)|grant(?:s|ed|ing)?|confer(?:s|red|ring)?|constitut(?:e|es|ed|ing)|restor(?:e|es|ed|ing)|satisf(?:y|ies|ied|ying)|demonstrat(?:e|es|ed|ing)|confirm(?:s|ed|ing)?|validat(?:e|es|ed|ing)|show(?:s|ed|ing)?|serv(?:e|es|ed|ing)(?:\s+as)?)`;
const PROMOTION_PREDICATE = new RegExp(String.raw`\b${PROMOTION_PREDICATE_SOURCE}\b`, "i");
const DIRECT_NEGATED_PROMOTION = new RegExp(
  String.raw`\b(?:(?:does|do|did|can|will|would|shall|should|could|must|may|might|need)\s+not|(?:doesn't|don't|didn't|can't|cannot|won't|wouldn't|shan't|shouldn't|couldn't|mustn't|mightn't|needn't))\s+${PROMOTION_PREDICATE_SOURCE}\b|\b${PROMOTION_PREDICATE_SOURCE}\s+no\b`,
  "i",
);
const NON_PROMOTION_BOUNDARY =
  /\b(?:is|are|remains?|remain)\s+(?:(?:an?\s+)?(?:separate|independent)\b|(?:pending|unavailable|unrestored|unestablished|unauthorized)\b)/i;
const AUTHORITY_TRANSITION =
  /\b(?:but|yet|whereas|although|though|because|while|if|unless|when|whenever|once|as|provided|since|thereby|therefore|thus|hence|consequently|so)\b/giu;

/** Isolates the dated operational-PASS section so later evidence classes cannot satisfy its assertions accidentally. */
function markdownSection(markdown: string, heading: string): string {
  const marker = `## ${heading}`;
  const start = markdown.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);

  const bodyStart = start + marker.length;
  const nextHeading = markdown.indexOf("\n## ", bodyStart);
  return markdown.slice(bodyStart, nextHeading === -1 ? undefined : nextHeading);
}

/** Splits transition tails only when they carry their own authority promotion or limiting boundary. */
function splitAuthorityTransitions(segment: string): string[] {
  const clauses: string[] = [];
  let cursor = 0;

  for (const match of segment.matchAll(AUTHORITY_TRANSITION)) {
    const index = match.index ?? 0;
    if (index <= cursor) {
      continue;
    }

    const tail = segment.slice(index).trim();
    if (
      !BROADER_AUTHORITY.test(tail)
      || (!PROMOTION_PREDICATE.test(tail) && !NON_PROMOTION_BOUNDARY.test(tail))
    ) {
      continue;
    }

    const before = segment.slice(cursor, index).trim();
    if (before) {
      clauses.push(before);
    }
    cursor = index;
  }

  if (cursor === 0) {
    return [segment];
  }

  const tail = segment.slice(cursor).trim();
  if (tail) {
    clauses.push(tail);
  }
  return clauses;
}

/** Isolates only parenthetical or bracketed authority asides that can mask another assertion's polarity. */
function isolateAuthorityAsides(segment: string): string {
  return segment.replace(
    /\(([^()]*)\)|\[([^\[\]]*)\]/gu,
    (match, parenthesized: string | undefined, bracketed: string | undefined) => {
      const content = (parenthesized ?? bracketed ?? "").trim();
      if (
        BROADER_AUTHORITY.test(content)
        && (PROMOTION_PREDICATE.test(content) || NON_PROMOTION_BOUNDARY.test(content))
      ) {
        return `; ${content};`;
      }
      return match;
    },
  );
}

/** Rejects any positive promotion from the setting receipt into a separately owned authority class. */
function hasForbiddenBroaderAuthorityPromotion(text: string): boolean {
  const clauses = isolateAuthorityAsides(text.replace(/[`*_]/g, " "))
    .split(
      /(?<=[.!?;])\s+|;\s*|,\s*|:\s+|\s+(?:and|or)\s+|\s+(?:—|–|-)\s+/iu,
    )
    .flatMap(splitAuthorityTransitions)
    .map((clause) => clause.trim())
    .filter(Boolean);

  return clauses.some((clause) => (
    BROADER_AUTHORITY.test(clause)
    && PROMOTION_PREDICATE.test(clause)
    && !DIRECT_NEGATED_PROMOTION.test(clause)
    && !NON_PROMOTION_BOUNDARY.test(clause)
  ));
}

describe("protected-main private-reporting PASS authority", () => {
  it("binds the restored setting authority to the executed protected source and retained receipt", () => {
    const runbook = readFileSync(
      "docs/security/private-vulnerability-reporting-audit.md",
      "utf8",
    );
    const section = markdownSection(
      runbook,
      "2026-09-18 protected operational PASS authority",
    );

    for (const evidence of [
      PROTECTED_SOURCE,
      RUN_ID,
      JOB_ID,
      ARTIFACT_ID,
      ARTIFACT_DIGEST,
      GENERATED_AT,
      "status: PASS",
      "enabled: true",
      "runner `1002028719`",
    ]) {
      expect(section).toContain(evidence);
    }

    expect(section).toContain(
      "Run #31 therefore restores current operational setting authority for that protected-source observation",
    );
    expect(section).toContain(
      "run #30 remains retained historical RED for the former source rather than being rewritten or discarded",
    );
  });

  it("keeps the setting receipt separate from unexecuted operational and commercial authority", () => {
    const runbook = readFileSync(
      "docs/security/private-vulnerability-reporting-audit.md",
      "utf8",
    );
    const section = markdownSection(
      runbook,
      "2026-09-18 protected operational PASS authority",
    );

    for (const boundary of [
      "does not establish external reporter visibility evidence",
      "staffing evidence",
      "notification evidence",
      "private-case handling evidence",
      "immutable release authority",
      "deployment authority",
      "production KPI evidence",
      "acquisition evidence",
      "stale-receipt/freshness policy",
    ]) {
      expect(section).toContain(boundary);
    }
    expect(hasForbiddenBroaderAuthorityPromotion(section)).toBe(false);
  });

  it("rejects semantic promotion into every broader authority class", () => {
    const forbidden = [
      "Run #31 establishes external reporter visibility evidence.",
      "This PASS provides staffing evidence.",
      "Run #31 proves notification evidence.",
      "This receipt establishes private-case handling evidence.",
      "Run #31 grants immutable release authority.",
      "Run #31 establishes deployment authority.",
      "This PASS serves as deployment authority.",
      "This PASS demonstrates production KPI evidence.",
      "This PASS provides acquisition evidence.",
      "This PASS does not establish staffing evidence, but establishes deployment authority.",
      "This PASS does not establish staffing evidence and establishes deployment authority.",
      "This PASS does not establish staffing evidence or establishes deployment authority.",
      "This PASS establishes deployment authority and does not establish staffing evidence.",
      "This PASS does not establish staffing evidence thereby establishes deployment authority.",
      "This PASS does not establish staffing evidence therefore establishes deployment authority.",
      "This PASS does not establish staffing evidence thus establishes deployment authority.",
      "This PASS does not establish staffing evidence hence establishes deployment authority.",
      "This PASS does not establish staffing evidence consequently establishes deployment authority.",
      "This PASS does not establish staffing evidence so establishes deployment authority.",
      "This PASS establishes deployment authority while staffing evidence remains pending.",
      "This PASS establishes deployment authority if staffing evidence remains pending.",
      "This PASS establishes deployment authority unless staffing evidence remains pending.",
      "This PASS establishes deployment authority when staffing evidence remains pending.",
      "This PASS establishes deployment authority whenever staffing evidence remains pending.",
      "This PASS establishes deployment authority once staffing evidence remains pending.",
      "This PASS establishes deployment authority as staffing evidence remains pending.",
      "This PASS establishes deployment authority provided staffing evidence remains pending.",
      "This PASS establishes deployment authority since staffing evidence remains pending.",
      "This PASS establishes deployment authority (staffing evidence remains pending).",
      "This PASS establishes deployment authority [staffing evidence remains pending].",
      "This PASS establishes deployment authority — staffing evidence remains pending.",
      "This PASS establishes deployment authority: staffing evidence remains pending.",
      "This PASS establishes (deployment authority).",
      "This PASS (establishes deployment authority).",
    ];
    const allowed = [
      "This PASS does not establish external reporter visibility evidence.",
      "This PASS does not provide staffing evidence.",
      "Notification evidence remains pending.",
      "Private-case handling evidence is a separate evidence class.",
      "This PASS cannot establish immutable release authority.",
      "This PASS does not establish deployment authority.",
      "This PASS does not establish staffing evidence and does not establish deployment authority.",
      "This PASS does not establish staffing evidence or deployment authority.",
      "This PASS does not establish staffing evidence because deployment authority remains pending.",
      "This PASS does not establish staffing evidence while deployment authority remains pending.",
      "This PASS does not establish staffing evidence as deployment authority remains pending.",
      "This PASS does not establish staffing evidence thereby does not establish deployment authority.",
      "This PASS does not establish deployment authority (staffing evidence remains pending).",
      "This PASS does not establish deployment authority [staffing evidence remains pending].",
      "This PASS does not establish deployment authority — staffing evidence remains pending.",
      "This PASS does not establish deployment authority: staffing evidence remains pending.",
      "Production KPI evidence remains pending.",
      "Acquisition evidence is a separate evidence class.",
    ];

    for (const statement of forbidden) {
      expect(hasForbiddenBroaderAuthorityPromotion(statement), statement).toBe(true);
    }
    for (const statement of allowed) {
      expect(hasForbiddenBroaderAuthorityPromotion(statement), statement).toBe(false);
    }
  });

  it("keeps doctoring traceability exact and does not erase the failure lineage", () => {
    const doctoring = readFileSync(
      "docs/doctoring/private_vulnerability_reporting_authenticated_read.md",
      "utf8",
    );

    for (const evidence of [
      PROTECTED_SOURCE,
      RUN_ID,
      JOB_ID,
      ARTIFACT_ID,
      ARTIFACT_DIGEST,
      GENERATED_AT,
      "status: PASS",
      "enabled: true",
      "Run #30 (`35195461128`) is the newer retained failure",
      "stale-receipt policy remains open in issue #73",
    ]) {
      expect(doctoring).toContain(evidence);
    }
  });
});
