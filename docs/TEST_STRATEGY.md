# Noema Test Strategy

## Status and authority

This document is the canonical test-strategy contract for Noema. It separates **protected-main product truth** from **active-PR validation**, **planned work**, and **production evidence**. A green pull-request check is evidence about the exact tested revision; it is not release, deployment, production-KPI, licensing, transfer-rights, or acquisition evidence.

## Protected-main verification contract

Noema's repository-owned application gate executes on pull requests and pushes to `main` through `.github/workflows/ci.yml`. For pull requests it resolves the live base branch independently, requires the exact PR head to contain that live base before validation, and refuses base drift after validation. Predecessor-head checks do not transfer to a changed head.

The protected-main command contract is defined by `package.json`:

1. `npm run typecheck` runs TypeScript with `tsc --noEmit`.
2. `npm run test` runs Vitest with V8 coverage.
3. `npm run security:scan` runs `npm audit --audit-level=high`.
4. `npm run kpi:verify` validates repository KPI evidence without converting missing production evidence into a production claim.
5. `npm run acquisition:manifest` and `npm run acquisition:integrity` validate acquisition data-room structure and integrity.
6. `npm run release:verify` composes those repository checks and is the application CI boundary.

`vitest.config.ts` requires **100% statements, branches, functions, and lines** for its explicit owned-production include set. Adding an owned production source path without meaningful execution evidence is not acceptable; coverage exclusions must not be used to conceal reachable production behavior. Tests should execute public or operator boundaries wherever a real boundary exists rather than relying only on source-text assertions.

## Test layers

### Unit and deterministic contract tests

Use deterministic tests for parsing, schema validation, normalization, bounded I/O, error classification, fail-closed decisions, evidence envelopes, cryptographic input validation, and pure policy logic. Boundary and malformed-input cases are first-class, not optional edge coverage.

### Integration tests

Exercise the Worker and operator entrypoints with realistic request, OIDC/JWKS, GitHub API, Durable Object, rate-limit, replay, readiness, acquisition-evidence, and operator-control flows. Integration tests must verify externally observable status, headers, error codes, side-effect ordering, secret non-disclosure, and fail-closed behavior.

### Security and privacy tests

Security tests cover authentication and authorization boundaries, exact origin/ref binding, redirect and SSRF-style egress constraints, bounded request/evidence sizes, fatal UTF-8 and duplicate-key handling where evidence is security-relevant, capability-file handling, credential redaction, replay prevention, rate limiting, and stale-evidence rejection. Necessary operational identifiers may remain usable, but tests must prevent unauthorized disclosure of secrets and unnecessary sensitive values.

The central `.github` Security Scan is a separate evidence authority. Noema must not reinterpret queued, skipped-required, cancelled, absent, neutral, failed, stale, predecessor, model-only, or feature-base-only scanner evidence as passing. Merge classification must use an eligible execution for the current protected-base relationship and the current central Security Scan contract.

### Operational and release tests

Operator scripts such as governance, preflight, workflow-registry, runner-assignment, production-governance, release-evidence, deployment-evidence, and acquisition audits must be tested for their exact authority boundaries and failure envelopes. A PASS from one operator does not imply authority or success for another channel.

Release validation requires one unchanged integrated protected head to satisfy all applicable repository CI, security, coverage, package/SBOM/provenance, review, migration/rollback/recovery, and operational gates together. Production deployment, strict 30-day KPI, immutable release publication, environment governance, and buyer-transfer evidence remain separate production/acquisition evidence and may not be synthesized from CI.

## Active-PR-only test lanes

The repository-owned patch-validator image/supply-chain lane is currently active PR work and is **not protected-main truth until merged**. Its dedicated workflow verifies an exact-head credential-free validator image with a checksum-pinned Node.js 24.19.0 build, non-root `scratch` runtime, no-network/read-only smoke execution, image/SBOM/vulnerability evidence, embedded `process.versions` inventory, raw per-component Grype evidence, and stale-head refusal. Its result is non-passing while queued, pending, failed, cancelled, skipped, or evaluated on a predecessor head.

When this or another active-PR-only lane is integrated, this document and traceability must be updated so that active-PR claims become protected-main claims only after exact integrated evidence exists.

## Regression workflow

For a verified Noema defect:

1. Bind the defect to the exact current head, live base, failing boundary, and owning component.
2. Write or strengthen the smallest realistic RED regression that reaches the intended production/operator boundary.
3. Apply the smallest root-cause-changing fix without weakening a gate.
4. Obtain narrow GREEN evidence, then the full applicable validation suite.
5. Refetch exact head, live base, reviews, unresolved findings, checks, and security evidence before merge classification.
6. Resolve only review threads whose underlying defect is actually addressed.

Failed or no-op remedies are evidence. After materially distinct failed hypotheses, reassess architecture or ownership instead of stacking symptom patches.

## Evidence separation

Keep these authorities distinct:

- source head and live base identity;
- application CI and coverage;
- formal review and unresolved-thread state;
- central Security Scan and other scanners;
- model/reviewer-agent judgments;
- package, SBOM, provenance, and release evidence;
- protected-main operational evidence;
- production deployment and KPI evidence;
- licensing, IP, NOTICE, and transfer-rights evidence.

No single green status may collapse these channels into a general readiness claim.

## Change acceptance

A test-strategy change is acceptable only when it remains consistent with current `package.json`, `vitest.config.ts`, `.github/workflows/ci.yml`, security/threat-model contracts, operability/release contracts, and `docs/TRACEABILITY.md`. Documentation changes that expose a concrete executable gap must be followed by source, test, API, schema, or operator work rather than treated as completion.
