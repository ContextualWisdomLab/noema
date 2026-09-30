# Continuation Dispatch Broker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a versioned Noema broker that validates an exact GitHub Actions identity and live PR, emits one allowlisted central continuation event without returning a GitHub credential, and returns an idempotent signed receipt.

**Architecture:** Keep `/exchange` unchanged. Route `POST /v1/continuation-dispatches` through the existing bounded edge, rate-limit, workflow-trust, and OIDC verification layers; delegate closed-schema parsing, idempotency, central-only GitHub egress, and receipt signing to focused continuation-dispatch modules and a SQLite Durable Object.

**Tech Stack:** TypeScript 5.9, Cloudflare Workers/SQLite Durable Objects, Web Crypto Ed25519/SHA-256, Vitest 4, OpenAPI 3.

**Spec:** `docs/superpowers/specs/2026-09-30-continuation-dispatch-broker-design.md`

## Global Constraints

- No consumer-visible GitHub credential, PAT fallback, inherited central secret, raw OIDC logging, or mutable workflow authority.
- Only `ContextualWisdomLab/.github` and the two released continuation actions/events are selectable.
- Every trust-boundary parser fails closed on duplicate/unknown keys, typed lookalikes, whitespace, multiple JSON values, and unbounded input.
- Exact replay returns stored evidence without a second GitHub call; conflict and indeterminate state never auto-dispatch.
- Runtime secrets are typed Worker bindings, never `process.env`.
- `/exchange` behavior and response schema remain unchanged.

---

### Task 1: Closed request and canonical digest

**Files:**
- Create: `src/continuation-dispatch/contract.ts`
- Create: `test/continuation-dispatch-contract.test.ts`

**Interfaces:**
- Produces: `parseContinuationDispatchRequest(text: string): ContinuationDispatchRequest`
- Produces: `canonicalContinuationRequest(request, workflowIdentity): string`
- Produces: `continuationRequestDigest(...): Promise<string>`
- Produces: `dispatchMapping(action): { eventType: "noema-review" | "strix-scan" }`

- [x] Write RED tests for the exact valid request and every rejected unknown, duplicate, typed, whitespace, multiple-value, SHA/ref, target, action, and retry case.
- [x] Run `corepack npm exec vitest run test/continuation-dispatch-contract.test.ts`; expect the module import to fail.
- [x] Implement the closed parser, lexicographic RFC 8785 canonicalizer for the admitted JSON value domain, action mapping, and lowercase hexadecimal SHA-256 digest without dependencies.
- [x] Run the focused test; expect PASS with no warning output.
- [x] Commit `test+feat(dispatch): define closed continuation contract`.

### Task 2: Durable exactly-once state

**Files:**
- Create: `src/continuation-dispatch/dispatch-state.ts`
- Create: `test/continuation-dispatch-state.test.ts`
- Modify: `src/runtime-entrypoint.ts`
- Modify: `wrangler.toml`

**Interfaces:**
- Produces: `NoemaContinuationDispatchState`
- Produces: `reserveContinuationDispatch(env, identity, digest): Promise<Reservation>`
- Produces: `commitContinuationOutcome(env, reservation, receipt): Promise<void>`

- [x] Write RED tests for first reservation, exact replay, conflicting digest, accepted/denied/indeterminate persistence, and malformed stored records.
- [x] Run the focused state test; expect missing implementation failure.
- [x] Implement one SQLite transaction per logical identity, bounded stored JSON, and fail-closed private command parsing.
- [x] Export/bind `NOEMA_CONTINUATION_DISPATCH_STATE` in `runtime-entrypoint.ts` and `wrangler.toml`.
- [x] Run state tests and `corepack npm run typecheck`; expect PASS.
- [x] Commit `test+feat(dispatch): add exactly-once continuation state`.

### Task 3: Live PR and fixed GitHub adapter

**Files:**
- Create: `src/continuation-dispatch/github-adapter.ts`
- Create: `test/continuation-dispatch-github-adapter.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: verified `JwtPayload`, `ContinuationDispatchRequest`, and existing GitHub App JWT/token helpers.
- Produces: `readAndVerifyLivePullRequest(...)`
- Produces: `dispatchCentralContinuation(...)`

- [x] Write RED tests for moved/closed/draft/fork PRs, wrong repository/base/ref, fixed target/path/event/payload, redirect denial, GitHub 403/404/422/5xx/network classification, and token absence from errors/logs.
- [x] Run the focused adapter test; expect missing implementation failure.
- [x] Extract only the existing App-JWT and bounded GitHub JSON helpers needed by both `/exchange` and the broker; do not duplicate them.
- [x] Implement read-only source App lookup and a separate central-only dispatch App token used solely for `POST /repos/ContextualWisdomLab/.github/dispatches`.
- [x] Run adapter tests, existing `test/worker.test.ts`, and typecheck; expect PASS.
- [ ] Commit `test+feat(dispatch): bind live PR and fixed central event`.

### Task 4: Credential-free signed receipt

**Files:**
- Create: `src/continuation-dispatch/receipt.ts`
- Create: `test/continuation-dispatch-receipt.test.ts`

**Interfaces:**
- Produces: `signContinuationReceipt(fields, env): Promise<SignedContinuationReceipt>`
- Produces: `verifyContinuationReceipt(receipt, publicKey): Promise<boolean>` for tests and documented consumer conformance.

- [ ] Write RED tests for deterministic RFC 8785 bytes, Ed25519 verification, OIDC-derived expiry, field mutation failure, and absence of token/bearer/assertion/private-key material.
- [ ] Run the focused receipt test; expect missing implementation failure.
- [ ] Implement dedicated Ed25519 PKCS#8 import, key-id validation, detached base64url signature, and public verification helper.
- [ ] Run receipt tests and typecheck; expect PASS.
- [ ] Commit `test+feat(dispatch): issue signed continuation receipts`.

### Task 5: Public route integration

**Files:**
- Create: `src/continuation-dispatch/handler.ts`
- Create: `test/continuation-dispatch-worker.test.ts`
- Modify: `src/index.ts`
- Modify: `src/worker.ts`
- Modify: `src/entrypoint.ts`
- Modify: `src/runtime-entrypoint.ts`
- Modify: `src/runtime-readiness.ts`
- Modify: `src/error-codes.ts`

**Interfaces:**
- Consumes: Tasks 1-4.
- Produces: `POST /v1/continuation-dispatches` standard success/error envelope.

- [ ] Write end-to-end RED tests proving method/content-type/body bounds, exact URL, rate limit, workflow SHA, single-use OIDC, live PR, one dispatch, exact replay, conflict, receipt signature, and operational headers.
- [ ] Run the focused worker test; expect 404/missing route failures.
- [ ] Admit the new route through each existing layer, add the six dispatch error codes/hints, require all new secret/DO bindings in readiness, and preserve `/exchange` byte-for-byte behavior tests.
- [ ] Run focused worker tests, all existing Worker tests, and typecheck; expect PASS.
- [ ] Commit `test+feat(dispatch): expose versioned continuation broker`.

### Task 6: Product, security, and operability contracts

**Files:**
- Modify: `openapi.json`
- Modify: `docs/api-spec.md`
- Modify: `docs/api-stability-contract.md`
- Modify: `docs/PRD.md`
- Modify: `docs/TRD.md`
- Create: `docs/adr/0019-continuation-dispatch-broker.md`
- Modify: `docs/adr/README.md`
- Modify: `docs/threat-model.md`
- Modify: `docs/runbook.md`
- Modify: `docs/product-technical-gap-baseline.md`
- Modify: `CHANGELOG.md`
- Modify: `README.md`
- Create: `test/continuation-dispatch-docs-contract.test.ts`

**Interfaces:**
- Publishes: v1 OpenAPI schema, public receipt verification contract, configuration/runbook, and immutable release prerequisites.

- [ ] Write RED docs-contract tests for endpoint/schema/error codes, required secret/DO bindings, no-token response, ADR status Proposed, and downstream `.github#2540` release order.
- [ ] Run the docs-contract test; expect missing-contract failures.
- [ ] Update every listed contract with the exact design and primary-source references; keep the ADR Proposed until protected integration.
- [ ] Run docs tests, typecheck, focused broker tests, `corepack npm test`, `corepack npm run security:scan`, and `corepack npm run release:verify`.
- [ ] Record the two pre-existing local baseline failures verbatim if they remain; do not filter, downgrade, or call the full suite GREEN.
- [ ] Commit `docs(dispatch): publish broker contracts and release gates`.

### Task 7: Exact-head owner PR and downstream handoff

**Files:**
- Modify only evidence text if exact SHA/check identifiers are added after publication.

**Interfaces:**
- Produces: Draft Noema owner PR linked to #735 and an exact downstream handoff for `.github#2540`.

- [ ] Fetch protected `main` and the live branch; non-force merge concurrent commits before publication.
- [ ] Re-run focused broker tests, typecheck, full suite, security, SBOM/provenance gates, and `git diff --check` on the exact candidate tree.
- [ ] Push without force, open Draft PR, and record head/tree/parents plus RED/GREEN evidence.
- [ ] Wait for exact-head required Checks and independent review without manual rerun; repair actual findings on the same branch.
- [ ] After ordinary merge, publish an immutable semantic version and verify release assets/provenance.
- [ ] Update `.github#2540` to the released endpoint/schema, remove the legacy exchange plus local `gh api` sequence, and prove a real consumer continuation and fresh exact-head model verdict.
