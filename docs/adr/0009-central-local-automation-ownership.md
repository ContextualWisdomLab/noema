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

Noema does not create a local duplicate Security Scan/reviewer workflow solely because a stacked target branch does not trigger the current central event filter. Missing central evidence remains a truthful dependency/trigger condition until the owner or dependency order changes.

## Consequences

- Noema remains independently deployable while reusing CWL governance.
- central workflow defects have one owner and one source of truth.
- event-selection gaps can temporarily defer a stacked PR instead of being hidden by a local nominal check.
- central changes require versioned/immutable consumption and compatibility testing.

## Verification

- `ARCHITECTURE.md` MSA boundary;
- `docs/UML.md` deployment/control topology;
- PR #80 stacked Security Scan trigger RCA demonstrates the no-duplicate-scanner rule;
- scheduler writer-lease policy prevents cross-repository writer races;
- central reusable workflow source is consumed through reviewed immutable identity rather than copied implementation.
