# External-extension lifecycle operability evidence

## Decision status

This note defines the evidence gate for issue #561 after lifecycle source integration. It does not declare the lifecycle Durable Object deployed, does not authenticate a future evidence producer, and does not move AppGuardrail, quarantine-sandbox-runtime, EgressWeave, Keyverse, or contextual-orchestrator authority into Noema.

## Problem

The protected source can prove lifecycle transition legality, replay/CAS behavior, compact current projection verification, complete audit verification, and fresh activation-evidence checks in repository tests. Those tests cannot establish production Durable Object latency, contention behavior, storage growth, restart recovery, or rollback recovery. Accepting a local `workerd` run, a synthetic benchmark, a precomputed percentile, or a reduced sample set as production evidence would collapse that distinction.

## Platform constraints

Cloudflare recommends SQLite-backed Durable Objects for new namespaces and, as of 2026-07-09, new namespaces must use SQLite on accounts that do not already have a legacy KV-backed namespace. SQLite-backed objects retain the KV storage API and add SQL plus point-in-time recovery. The SQLite Storage API documents atomic/isolated storage operations, asynchronous `transaction()`, and SQLite-only synchronous storage/`transactionSync()` capabilities. Cloudflare also documents a 10 GB per-object SQLite storage limit and notes that a single Durable Object is inherently single-threaded, so contention and storage-growth evidence must be measured on the deployed object rather than inferred from unit-test concurrency.

The same SQLite Storage API exposes `ctx.storage.sql.databaseSize`, the current database size in bytes. That is the canonical source for this acceptance contract's per-object `bytes_before` / `bytes_after` observations. Cloudflare's 2026-07-20 namespace-level Total storage dashboard is useful operational corroboration, but Cloudflare explicitly does not expose that dashboard metric by individual Durable Object ID/name; therefore namespace chart values cannot substitute for the exact object's `databaseSize` evidence.

Noema already uses declarative Wrangler `exports` for its existing SQLite Durable Object classes. A later runtime-wiring change for the lifecycle class must therefore be reviewed as an explicit binding/export reconciliation and must not infer deployment from this evidence evaluator.

## Evidence contract

`scripts/lib/external-extension-lifecycle-operability-evidence.mjs` accepts only `source_kind = cloudflare_durable_object_remote` and `storage_backend = sqlite`. The evidence binds repository, protected/deployed revision, canonical lifecycle binding name, and a canonical UTC observation instant.

For both `read_current` and `contended_append`, the producer retains the full measured latency array, the planned denominator, failure count, and excluded warm-up count. Acceptance requires at least 100 retained measurements, zero excluded warm-up attempts, denominator equality, and zero failed requests. The evaluator calculates p95 itself using the deterministic nearest-rank rule and requires p95 <= 20 ms. A producer-supplied p95 is not authority.

Pairwise contention rehearsal requires one accepted CAS winner and one conflict loser per trial. The contended-append latency series is the two append attempts from those same pairwise trials, not a separate or summarized benchmark: `planned_samples` must equal `2 * contention_trials`, and every retained latency sample belongs to one of those winner/loser attempts. This prevents a small contention proof from lending its label to an unrelated low-latency sample series. Recovery evidence must retain at least 129 lifecycle events so the test crosses the Workflow / Task receipt-ring size, verify complete audit rebuild, verify restart recovery and rollback recovery, and demonstrate rejection of malformed head and truncated audit evidence. The remote producer reads `ctx.storage.sql.databaseSize` immediately before and after the same acceptance run so per-object storage growth is observable rather than inferred from a namespace aggregate.

These checks make structurally incomplete evidence and evidence explicitly labeled as local, synthetic, or fixture data fail closed. They do not detect a producer that lies about those fields and do not cryptographically authenticate the producer. The eventual deployment/evidence collector must bind these bytes to the exact deployed revision and runtime identity through the owning release/deployment path. Until that exists, a PASS from the pure evaluator is necessary but not sufficient for issue #561 completion.

## Alternatives rejected

- **Use local/workerd timing as production evidence.** Rejected because scheduler, storage, network, and deployed-object contention differ from the remote service.
- **Accept a reported p95.** Rejected because excluded failures, discarded tail samples, or warm-up filtering could make an unverifiable percentile look compliant.
- **Use an independent append-latency series beside a smaller contention proof.** Rejected because the resulting p95 would not establish latency under the CAS contention that the acceptance claim names; the denominator is therefore bound to both attempts in every pairwise trial.
- **Use namespace-level storage charts as per-object evidence.** Rejected because Cloudflare's dashboard metric is namespace-wide and cannot be viewed by Durable Object ID/name; the deployed object's `ctx.storage.sql.databaseSize` is the reviewed per-object source.
- **Scan the complete lifecycle audit on every latency-sensitive current read.** Rejected because `readCurrent()` intentionally verifies the compact head and exact tail in O(1) retained-event cardinality; full-prefix verification belongs to audit/recovery.
- **Copy foreign-owner verdicts into the benchmark.** Rejected because Noema consumes immutable owner references/digests and must not become the scanner, quarantine, or outbound-policy authority.

## Follow-up

1. Add the lifecycle Durable Object runtime binding/export only with a reviewed Noema-owned authority adapter for activation-time Policy / Approval and foreign-owner evidence resolution.
2. Produce remote evidence on an exact deployed revision without sample reduction or warm-up exclusion, reading per-object storage bytes from `ctx.storage.sql.databaseSize`.
3. Run the evaluator and retain the bounded evidence plus deployment/release provenance.
4. Exercise SQLite point-in-time recovery or an equivalent reviewed rollback path against the lifecycle object and retain the recovery receipt.
5. Keep ADR 0015 Proposed until runtime and release acceptance are complete.

## References

Cloudflare. (2026, June 30). *Declarative class lifecycle with `exports`*. Durable Objects release notes. https://developers.cloudflare.com/durable-objects/release-notes/

Cloudflare. (2026, July 9). *New Durable Object namespaces must use the SQLite storage backend*. Cloudflare changelog. https://developers.cloudflare.com/changelog/post/2026-07-09-restrict-new-kv-backed-namespaces/

Cloudflare. (2026, July 20). *View total SQLite storage for Durable Object namespaces*. Cloudflare changelog. https://developers.cloudflare.com/changelog/post/2026-07-20-durable-objects-total-storage-metrics/

Cloudflare. (2026, May 27). *SQLite-backed Durable Object Storage*. https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/

Cloudflare. (2026, June 1). *Limits*. Durable Objects. https://developers.cloudflare.com/durable-objects/platform/limits/
