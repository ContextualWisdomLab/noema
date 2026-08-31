# ADR-0009: Separate central CWL policy ownership from Noema-local orchestration

- **Status:** Accepted
- **Scope:** `ContextualWisdomLab/.github`, Noema workflows, reviewer/model integration

## Context

ContextualWisdomLab central workflows provide organization-wide security/review policy, while Noema has repository-specific runtime, evidence, maintenance and product-development semantics. Copying central scanners/reviewer logic into Noema merely to obtain a desired check creates divergent policy, duplicate Actions load and ambiguous authority. Conversely, pushing every Noema-specific invariant into the organization repository couples standalone operation to a central implementation detail.

## Decision

Ownership follows the narrowest stable boundary.

### Central `.github` owns

- reusable organization security/review workflow implementation and common policy;
- organization-wide workflow source/release lifecycle;
- shared interfaces used by multiple repositories.

### Noema owns

- its Worker runtime and credential-exchange trust;
- Noema-specific evidence semantics and merge policy composition;
- repository-specific maintenance/product-development orchestration;
- Noema canonical PRD/TRD/Architecture/ADR/UML/ERD/operability documentation;
- adapters/contracts required to consume central workflows without copying their implementation.

### Cross-repository rule

A repository with its own enabled dedicated writer loop is a read-only dependency to the Noema writer. Cross-repository defects are documented or handed to the owning loop; Noema does not race it.

The protected central Security Scan has no pull-request base-branch filter, so stacked feature-base PRs receive the same scanner workflow. Noema does not create a local duplicate scanner/reviewer workflow; missing expected evidence remains a truthful routing failure until the owning central workflow is repaired.

## Consequences

- Noema remains independently deployable while reusing CWL governance.
- central workflow defects have one owner and one source of truth.
- absent or non-terminal central evidence defers a stacked PR instead of being hidden by a local nominal check.
- central changes require versioned/immutable consumption and compatibility testing.

## Verification

- `ARCHITECTURE.md` MSA boundary;
- `docs/UML.md` deployment/control topology;
- the protected scheduler writer-lease and central Security Scan trigger contracts demonstrate the no-duplicate-scanner rule;
- scheduler writer-lease policy prevents cross-repository writer races;
- central reusable workflow source is consumed through reviewed immutable identity rather than copied implementation.
