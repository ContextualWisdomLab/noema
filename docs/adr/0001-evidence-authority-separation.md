# ADR-0001: Separate evidence classes from authority planes

- **Status:** Accepted
- **Decision owners:** Noema maintainers
- **Scope:** review, security, merge, release, deployment, acquisition evidence

## Context

GitHub exposes several success-looking objects: Check Runs, commit statuses, formal reviews, review comments, scanner/SARIF results, workflow runs, model verdicts and mergeability metadata. They differ in producer identity, executed revision, semantics and authority. Treating one green object as a substitute for another creates false approval and stale-evidence risks.

The risk is material for Noema because the product itself brokers reviewer/maintainer capabilities. A model or integration that can publish a status must not thereby obtain protected-branch merge authority.

## Decision

Noema maintains the following classes independently:

1. **check runs** — workflow/job execution evidence;
2. **commit statuses** — integration-provided commit context;
3. **formal review evidence** — GitHub review state plus unresolved-thread context;
4. **scanner evidence** — scanner result plus the revision actually scanned;
5. **model judgement** — LLM diagnostic/verdict evidence;
6. **merge authority** — ruleset/branch-protection and merge API authority;
7. **release authority/evidence** — package/version/provenance/release acceptance;
8. **deployment authority/evidence** — protected environment and production activation;
9. **commercial/acquisition evidence** — customer/revenue/transfer evidence.

A passing state in one class never silently satisfies another class.

Exact-revision binding is part of evidence identity. Predecessor-head, stale-base or synthetic-merge evidence may still be useful diagnostic/integration evidence, but it must be labelled as such rather than promoted to immutable-head proof.

## Consequences

### Positive

- status spoofing cannot become formal approval merely through naming.
- model verdict can assist review without becoming protected merge authority.
- security scanners can retain useful integration/base evidence without mislabelling the executed revision.
- buyer due diligence can see which proof is code-generated versus external/operational.

### Cost

- the maintenance loop must collect and paginate multiple APIs independently.
- a PR can remain blocked even when several green indicators are visible.
- ruleset and reviewer identity provisioning require external operational work.

## Invariants

- `COMMENTED`, text comments, reactions, model output and commit status are not `APPROVED` reviews.
- queued/pending/cancelled/absent/skipped-required/stale-head evidence is not passing exact-head evidence.
- formal approval eligibility is evaluated separately from model quality.
- merge does not imply release; release does not imply deployment; deployment does not imply commercial readiness.
- persisted evidence may be cross-checked but never trusted solely because its stored field says `passed=true`.

## Verification

- `ARCHITECTURE.md` authority-plane table.
- `scripts/hourly-commercial-readiness.mjs` and `scripts/lib/commercial-readiness-loop.mjs` policy tests.
- review/status/check collision and pagination tests.
- acquisition/data-room integrity tests.
- current repository ruleset and App provisioning remain separately tracked under issues #27 and #29.

## Rationale sources

The primary-source and APA 7 bibliography for immutable source revision, GitHub OIDC identity and acquisition/security evidence is maintained in `docs/doctoring/architecture-trust-boundaries.md`.
