# ADR-0006: Require protected-main operational acceptance for privileged controls

- **Status:** Accepted
- **Scope:** credential exchange, reviewer/maintainer automation, release/deployment controls

## Context

A PR branch can pass unit tests, coverage and security checks while the resulting control still has never run under the real protected default branch, App installation, environment protection, workflow source, secret binding or deployment topology. For privileged automation, treating branch-level GREEN as operational completion hides configuration and identity failures outside repository source.

## Decision

Noema separates implementation proof from protected-main operational acceptance.

```text
PR implementation
→ exact-head deterministic verification
→ protected merge
→ protected-main execution / configuration proof
→ release acceptance
→ deployment acceptance
→ commercial/acquisition evidence
```

Each stage is independently evidenced.

Privileged changes such as Maintainer/Reviewer App activation, workflow-source trust, production environment governance, release publication, deployment traffic and rollback are not marked operationally complete merely because their code/tests merged.

## Required operational proof

Where applicable:

- protected-main workflow checks out the expected reviewed source;
- effective App identity and exact permissions are verified without exposing credentials;
- enabled/disabled state behaves as documented;
- required ruleset/environment policy is enforced by the hosting control plane;
- App-authored mutations trigger the intended downstream workflows;
- health/readiness/smoke verifies the actual deployed service;
- rollback/disable path is exercised or independently verified;
- retained receipts bind repository, source, environment and observation time.

## Consequences

- repository source remains honest about controls it cannot prove by itself;
- issues #27/#29 and production environment work remain open until operational evidence exists;
- release and acquisition documentation cannot substitute for missing runtime/governance proof.

## Verification

- `docs/OPERABILITY.md` activation, governance, incident and rollback procedures;
- `docs/TRACEABILITY.md` separates branch, operational, release/deployment and commercial evidence;
- main governance issue #27;
- Maintainer/Reviewer App provisioning issue #29;
- production environment/release/deployment evidence workflows and retained receipts.
