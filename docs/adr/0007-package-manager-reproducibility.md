# ADR-0007: Bind package and lockfile evidence to a deterministic toolchain

- **Status:** Proposed
- **Implementation owner:** PR #78
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

PR #78 is the active implementation and test owner. It must remain `Proposed` here until protected integration and exact-head/base verification pass. PR #76 contains the bounded `nanoid` remediation and demonstrates why toolchain identity matters, but does not by itself complete repository-wide policy.

## Rationale

Detailed npm/Node/GitHub Actions primary-source rationale and APA 7 references belong to `docs/doctoring/package-manager-reproducibility.md` on PR #78. This ADR records the durable architectural decision without duplicating tool versions that may later be intentionally upgraded.
