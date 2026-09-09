# External-extension lifecycle recovery

## Status

**Candidate authority on PR #574.** This document is code-current for the Noema-owned external-extension lifecycle implementation on this branch. It does not establish protected, released, deployed, or production-operational authority until the exact source is integrated and the corresponding acceptance evidence exists. ADR 0015 remains **Proposed**.

## Recovery boundary

Noema owns recovery of its own Tool Capability lifecycle event stream, current State / Checkpoint projection, idempotency identity, and transition/version/head authority. Recovery must not reconstruct foreign-owner truth from local copies.

The following remain references or digests only:

- AppGuardrail scanner/evidence authority;
- quarantine-sandbox-runtime isolation/execution authority;
- EgressWeave outbound-policy authority;
- Keyverse identity or secret authority;
- contextual-orchestrator model/provider routing authority;
- consumer-product domain truth.

A recovered Noema lifecycle therefore proves which immutable references authorized historical transitions. It does not make those historical references current live authority for a new activation.

## Durable identity and partition

One lifecycle stream is partitioned by the complete `ExternalExtensionLifecycleStreamIdentity`:

- `external_extension_id`;
- exact `upstream_repository` + `upstream_commit_sha` + `upstream_path`;
- exact `artifact_sha256`;
- exact `marketplace_entry_sha256`.

The repository derives a stream prefix from the canonical stream identity digest. Events are stored by monotonically increasing version, transition IDs have a separate idempotency index, and the compact `head` projection binds `(stream, version, state, head_event_sha256)`.

A different source commit, path, artifact digest, marketplace-entry digest, or extension identifier is a different stream. Recovery must never splice those histories together.

## Recovery invariants

Recovery is fail-closed unless all applicable invariants hold:

1. Event versions are contiguous from 1 with no deletion, reordering, duplicate version, or silent gap.
2. Each event's `prior_event_sha256` equals the verified digest of the preceding event.
3. Each event's `request_sha256` recomputes from the complete canonical transition request.
4. Each `event_sha256` recomputes from the complete event hash material.
5. Every retained event belongs to the requested exact stream identity.
6. The compact head exists iff retained events exist, and its version/state/head digest exactly matches the verified audit tail.
7. A transition-id index may produce replay only when the stored request digest and referenced event are intact; the same transition ID naming different semantics is a conflict.
8. Malformed, truncated, forged, cross-stream, stale-version, or unverifiable persisted state is an integrity failure, not an empty/new stream.
9. Historical replay is verified from committed immutable evidence. It does not reconsult later mutable Policy / Approval or foreign-owner evidence and thereby rewrite history.
10. A **new** transition to `active` must re-read current Noema Policy / Approval and owner evidence through the lifecycle evidence-verifier port immediately before append; missing, expired, revoked, drifted, or unverifiable evidence fails closed.

## Normal restart recovery

For a normal restart or Durable Object rehydration:

1. Reconstruct the exact stream identity from the admitted immutable source/artifact identity. Do not accept a client-supplied current state as authority.
2. For a latency-sensitive current-state read, call the compact projection path. `readCurrent()` verifies the persisted head and the exact referenced audit tail, including request/event digests and stream identity. This path is O(1) in retained-event cardinality; it is not a complete audit.
3. Before audit, repair, migration, destructive cleanup, or a recovery claim, call the full audit path. `readAudit()` reads the retained event prefix, verifies contiguous versions and the entire hash chain, and verifies that the compact head matches the final verified event.
4. If full audit succeeds, the final verified event determines the recovered current lifecycle state. Do not synthesize an additional transition simply to mark restart.
5. If full audit fails, quarantine the lifecycle stream from further Noema authority and investigate the durable evidence. Do not reset the head, truncate the prefix, rewrite an event, or auto-rebase a stale writer.

## Append and contention recovery

`append()` computes canonical request/event digests outside the short storage transaction. It obtains a verified current projection, re-reads current activation evidence for a genuinely new `active` transition, and then uses a storage transaction as the minimal compare-and-swap boundary.

Inside the transaction the repository revalidates expected version, prior state, and prior head digest before writing the new immutable event, transition-id index, and head projection. A competing writer that changes any of those values wins the CAS; the stale writer fails with `ExternalExtensionLifecycleConflictError` rather than rebasing itself.

If another writer commits the exact same transition ID and semantics, the transaction loser receives only a replay candidate. Full Web Crypto verification occurs after the short transaction through the normal immutable replay path. If the index/event/head evidence disappeared or changed before that verification, the replay fails closed.

This distinction is important for activation races: a writer that missed an exact committed activation during preflight may return the already-committed, cryptographically verified historical replay even if live owner evidence is subsequently revoked. That does not authorize a new activation. A genuinely new activation still requires fresh owner evidence.

## Corruption and truncation response

The application path must not repair corrupted lifecycle authority by mutation. On any digest, sequence, stream, index, or head/tail mismatch:

- stop new lifecycle appends for the affected exact stream;
- retain the durable bytes and incident metadata needed for forensic comparison;
- verify whether the failure is storage corruption, partial restore, operator migration error, or hostile modification;
- compare against an independently retained backup/export or platform recovery point when one exists;
- restore only an internally consistent prefix whose source and restoration procedure are independently evidenced;
- rebuild the compact head from the last verified event only through an explicit recovery/migration operation, never by silently accepting client state;
- record the recovery action and rerun the complete audit before returning the stream to service.

A shorter prefix is not automatically acceptable. If previously acknowledged later events cannot be accounted for, the stream remains failed closed even when the shorter prefix is internally hash-consistent.

## Suspension, supersession, expiry, and rollback

Rollback is represented by lifecycle events, not history deletion. The state machine permits only the explicit edges implemented by the lifecycle aggregate. In particular, an `active` extension may move to `suspended`, `superseded`, or `expired`; a suspended extension may later return to `active` only through the normal activation evidence check.

Operational rollback therefore means appending the appropriate legal transition and making invocation consult the verified current projection. It does not mean reverting the durable event history or restoring an older head as if later events never occurred.

## Retention and future compaction

The current lifecycle audit path is append-only and is deliberately not the bounded 128-receipt Workflow / Task observability ledger. Early lifecycle events remain part of the reconstructable buyer/audit chain.

Future segmented archival or compaction is permissible only if a versioned ADR and implementation preserve all of the following:

- an immutable retained event prefix or independently verifiable segment artifacts;
- cryptographic continuity between archived segments and the live tail;
- an exact snapshot identity bound to the complete summarized prefix;
- restart reconstruction without mutable issue prose or foreign-owner state;
- evidence that an attacker cannot replace a historical segment with another internally valid stream;
- migration/rollback tests and a recovery rehearsal on the actual Durable Object storage backend.

A ring buffer, unbound snapshot, or deletion of early events is not acceptable canonical lifecycle evidence.

## Recovery rehearsal acceptance

Source-level unit tests are necessary but do not establish runtime recovery readiness. Before ADR 0015 can advance beyond Proposed for this capability, capture exact-head evidence against the actual Durable Object storage backend for at least:

- restart after an `active` transition and successful full-chain reconstruction;
- restart after `suspended`, `superseded`, and `expired` transitions;
- concurrent legal transitions where exactly one CAS append wins;
- exact duplicate replay and same-ID/different-semantics rejection after restart;
- forged/truncated event prefix, forged head, missing tail, wrong-stream substitution, and corrupt transition index;
- >128 transitions with the earliest lifecycle evidence still auditable;
- backup/restore or equivalent platform recovery followed by complete audit and head reconstruction verification;
- partition/lock behavior and storage growth under realistic contention;
- current-projection and contended-append latency, with p95 <= 20 ms only where the synchronous buyer/runtime path requires it and only when measured without reduced samples or unrealistic cache-only warm-up.

Record exact source revision, Durable Object/runtime version, dataset/event count, concurrency, timing method, failures, and recovery outcome. A successful unit-test timer or an algorithmic O(1) statement is not performance or recovery acceptance.

## Operator decision table

| Observation | Recovery decision |
| --- | --- |
| Head and exact tail verify; full audit verifies | Resume from the verified current state. |
| Exact transition ID and request digest verify after a retry | Return immutable replay; do not append a duplicate event. |
| Same transition ID resolves to different request semantics | Fail closed as conflict. |
| Expected version/state/head changed during append | Fail closed as CAS conflict; reread and make a new explicit decision. |
| New activation evidence is missing/revoked/drifted | Reject the new activation; do not alter historical events. |
| Head/tail mismatch, missing event, digest failure, or truncated prefix | Stop authority for that stream and enter forensic recovery. |
| Restored prefix is internally valid but acknowledged later events are unexplained | Keep failed closed; do not treat the shorter history as canonical. |

## Non-goals

This recovery contract does not:

- implement or own AppGuardrail, quarantine, isolation, outbound, identity, or model-routing recovery;
- authorize editing/deleting lifecycle events through the application path;
- make a stale Policy / Approval historical event current authority;
- claim production Durable Object recovery, PITR, release, deployment, pilot, SLA, or KPI evidence before those operations are actually exercised and retained;
- replace `docs/OPERABILITY.md`, `docs/TEST_STRATEGY.md`, ADR 0015, or the canonical PRD/TRD/Architecture/UML. It supplies the dedicated recovery procedure those documents reference.