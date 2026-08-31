# ADR-0007: Bind package and lockfile evidence to a deterministic toolchain

- **Status:** Proposed
- **Implementation surfaces:** `.github/lockfile-change-policy.json`, `scripts/lockfile-change-control.mjs` and package/lockfile contract tests
- **Scope:** Node/npm identity, install-script authority, lockfile regeneration and change control

## Context

A lockfile can be syntactically valid and pass installation while containing unrelated metadata rewrites introduced by a different npm/toolchain. Security remediation #76 exposed this directly: a candidate regeneration changed the intended `nanoid` resolution together with unrelated package metadata. Green `npm ci`/audit output alone therefore does not prove that a lockfile diff is minimal, reviewed or reproducible.

## Decision

Repository-level package evidence must be bound to a reviewed deterministic Node/npm identity and exact base/source revision.

The intended contract is:

- pin the reviewed Node distribution and npm version used for lockfile validation;
- verify tool versions before dependency installation;
- use immutable Action source SHAs;
- explicitly allow/deny dependency lifecycle scripts rather than globally trusting all install scripts;
- validate lockfile changes against the exact live base and changed package-object identities;
- reject undeclared metadata churn, stale-base policy, malformed/ambiguous evidence and duplicate JSON keys;
- keep vulnerability audit strict; reproducibility is not an audit waiver.

## Consequences

- routine dependency updates require explicit evidence rather than opaque lockfile churn;
- package-manager upgrades become reviewed changes with a controlled migration path;
- CI can distinguish a security fix from unrelated resolver/toolchain side effects.

## Verification

The repository-level policy is implemented on protected main. This ADR remains `Proposed` until its broader architectural acceptance is recorded; current exact-head/base execution remains observation-scoped evidence rather than a timeless claim.

## Rationale

Detailed npm/Node/GitHub Actions primary-source rationale and APA 7 references belong to `docs/doctoring/package-manager-reproducibility.md`. This ADR records the durable architectural decision without duplicating tool versions that may later be intentionally upgraded.
