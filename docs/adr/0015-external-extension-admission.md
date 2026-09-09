# ADR 0015: Fail-closed admission for external Claude community plugins

Status: Proposed

## Context

CWL products can discover curated plugins through `anthropics/claude-plugins-community`, but wholesale marketplace installation would turn third-party prompts, hooks, MCP servers, shell commands, and network access into implicit runtime authority. Anthropic review of that catalog is useful upstream evidence, not CWL admission authority. Issue #545 assigns the Tool / Capability Boundary the job of versioned external-extension descriptors, least-authority activation, expiry, rollback, and invocation receipts.

`context-graph-contracts` does not yet publish an immutable shared artifact contract for this descriptor. AppGuardrail, quarantine-sandbox-runtime, EgressWeave, and Keyverse remain the owners of scanning, isolation, egress, and secret handles. Waiting for those foreign GA releases would stall an independently verifiable Noema port.

Source/catalog identity and scanner receipts are necessary but not sufficient for product approval. A descriptor carrying valid immutable source and scan pins can still self-assert `active`, broaden product or role scope, or extend validity unless Noema Policy / Approval independently issues those fields. Scanner success therefore cannot be promoted into activation authority.

Activation and invocation envelopes also carry event timestamps supplied by the caller. Those timestamps are useful chronology evidence but cannot be current-time authority: after a grant expires, a caller could otherwise submit an old in-window `activated_at` or `invoked_at` and keep exercising expired authority.

Replay equality needs all semantic invocation fields, but retaining their normalized JSON beside a receipt would retain reversible instruction, observed-content, rejected secret/product inputs, and hidden-reasoning input longer than necessary. Replay authority therefore needs a non-reversible, versioned equality identity rather than a plaintext request copy. A security review also rejected implementing SHA-256 itself inside Noema: cryptographic primitive ownership is not a Tool / Capability domain responsibility.

The protected admission port still lacks restart-safe lifecycle evidence. Process-local descriptor/provenance state cannot by itself prove after restart which exact source, Noema Policy / Approval, and owner-evidence pins caused `discovered → … → active → suspended/superseded/rejected/expired`. Issue #561 therefore adds a separate State / Checkpoint concern: lifecycle transition evidence must be append-only, partitioned by exact admitted artifact identity, and reconstructable without turning foreign owner state into Noema truth.

## Decision

Noema keeps a local fail-closed Tool / Capability port in `src/tool-capability/external-extension-admission.ts`:

- Admission binds exact `upstream_repository`, lowercase commit SHA, relative path, artifact digest, and marketplace-entry digest.
- Mutable branches, tags, `latest` versions, absolute paths, and parent-segment paths are rejected.
- Marketplace metadata that disagrees with an independently pinned catalog is rejected.
- AppGuardrail and quarantine receipts must be pinned separately and must match the artifact and isolation policy.
- Noema Policy / Approval independently issues the maximum admission status, allowed product repositories, allowed execution roles, validity interval, isolation/egress references, activation-policy version, and the exact owner-profile identities/digests that its admission policy requires. Descriptor fields may narrow that grant but cannot broaden it.
- Policy / Approval evidence is explicit operator-controlled input. Noema source contains no default pilot grant and no synthetic AppGuardrail/quarantine profile digest that can become production admission authority.
- Unknown extensions have no implicit Policy / Approval grant. An absent, revoked, malformed, throwing, or drifted policy authority fails closed.
- Activation must cite the activation-policy version issued by Noema; invocation re-resolves the policy grant and rejects revocation or drift rather than reusing stale admission authority.
- Activation and invocation require the Noema runtime wall clock to be inside both the admitted descriptor and independently issued Policy / Approval validity windows. Caller-supplied `activated_at` and `invoked_at` remain event evidence and cannot backdate current authorization.
- Authentic activations and invocation receipts are bound to the exact admitted source snapshot that issued them; matching artifact bytes or product/role/policy fields do not authorize cross-admission replay.
- Replay equality retains only `noema.external_extension.invocation_envelope:v1:sha256:<digest>`, computed from a fixed-order canonical tuple of every semantic invocation field. The retained value is domain-separated and versioned; plaintext normalized invocation JSON is not retained for replay equality.
- SHA-256 is delegated to the Worker runtime's Web Crypto `crypto.subtle.digest("SHA-256", ...)`. Noema owns only the domain/version prefix, canonical field order, replay-state lifecycle, and fail-closed interpretation. It does not own SHA-256 padding, message schedule, compression rounds, provider routing, or a vendored cryptographic implementation.
- Because Web Crypto digest is asynchronous, the public invocation admission returns a promise for successful/replay publication. Structural, product/role/policy, chronology, secret/product-data and exact-admission validation remains synchronous before that promise is created; the accepted receipt is not published until the runtime digest completes successfully. Digest-provider failure is normalized into the domain error and fails closed.
- Replay-digest state for invocation-envelope equality is process-local and keyed by receipt lifetime. Process restart discards that invocation replay authority and therefore fails closed rather than migrating or reconstructing an unverifiable old plaintext/digest binding. A future canonicalization or digest change requires a new explicit version; old in-memory bindings are not silently reinterpreted.
- `developer_assist` admits no filesystem, network, process, secret, or MCP capabilities. Provider keys and broad GitHub authority are forbidden.
- Product-scoped activation cannot use another product's approval. `approved_for_pilot` is not invocation authority.
- Expired, suspended, superseded, rejected, or rollback-marked extensions cannot be invoked.
- Catalog drift after admission cannot silently update an active extension.
- Duplicate activation and invocation events are idempotent replay; conflicting retained events fail closed.
- An invocation timestamp cannot predate the issued activation it cites; descriptor-window validation, runtime-current validity, and activation-to-invocation causal order are separate invariants.
- Plugin instructions cannot promote observed content into trusted policy or new capability.
- Product-runtime mode cannot execute a Claude plugin wrapper.
- Invocation receipts contain only identity fields and must not carry secrets, raw product data, or hidden reasoning.

Issue #561 extends this decision with a Noema-owned durable lifecycle aggregate in `src/tool-capability/external-extension-lifecycle-store.ts`. This is lifecycle/State/Checkpoint evidence, not a replacement for the invocation-envelope replay digest above:

- One stream is keyed by `external_extension_id` plus exact upstream repository/commit/path/artifact and marketplace-entry identities. A different exact artifact is a different stream even when the human extension name is unchanged.
- Each append binds schema/version, transition ID, prior/next lifecycle state, exact Noema Policy / Approval version, effective scope reference, immutable AppGuardrail/quarantine profile identities and digests, isolation and Egress references, occurrence/causation/correlation IDs, and an actor/service handle. Raw plugin prompt/content, product data, secrets, provider credentials, and hidden reasoning are outside the persisted shape.
- Noema persists references/digests to AppGuardrail, quarantine-sandbox-runtime, EgressWeave, Keyverse, and other owner evidence; it does not persist editable copies of their verdict/policy/runtime truth.
- Canonical request/event digests are computed outside the short Durable Object storage transaction. The serialized transaction rechecks expected version, current state, and prior head digest before appending the immutable event and updating the compact projection. A conflict fails closed; it is never auto-rebased.
- An exact committed transition ID + request digest is immutable replay evidence. Same ID with different semantics is a conflict. Historical replay reconstructs the snapshot at that event rather than returning the later current head.
- A genuinely new `active` transition must re-read fresh Policy / Approval and owner evidence before its CAS append. If a competing writer commits that exact activation after preflight and fresh evidence then fails, the loser may return replay only after cryptographically verifying that exact durable transition/head/tail; otherwise the evidence error is propagated. Later owner drift cannot retroactively erase a historical committed event.
- Replay verification checks retained request/event digests and current head/audit-tail binding. The transaction-time loser returns only a detached replay candidate; Web Crypto verification runs after the storage transaction so digest work does not extend the serialization window.
- The current projection reads the compact head and its exact tail event with O(1) storage cardinality and verifies request/event digest plus stream/version/state/head binding. Complete retained-prefix verification remains an audit/recovery path.
- Lifecycle history is not stored in the workflow store's `MAX_TRANSITION_RECEIPTS = 128` observability ring. Retention/segmentation must preserve prefix continuity and early-event auditability across restart; destructive compaction is not accepted.
- The implementation reuses the existing Durable Object storage/transaction family instead of introducing cross-service SQL or another database authority. This does not itself prove deployed transaction semantics or the ≤20 ms buyer-path target.

The existing catalog/scanner/admission/activation/invocation implementation remains behind an internal Tool / Capability core. Exact admission issuance/replay provenance is owned once by that core. The public port adds the Noema Policy / Approval ACL, current-time authorization, admission-bound live authority, and request-envelope replay digest without copying AppGuardrail, quarantine, EgressWeave, Keyverse, or contextual-orchestrator authority. Policy / Approval must be supplied through an explicit immutable trust input; repository source does not mint a pilot grant from placeholder owner-policy digests. This local ACL remains a provisional Noema boundary and is not a substitute for a future released shared contract or live pilot approval.

The replay digest follows SHA-256 as specified by FIPS 180-4. The fixed field order and explicit domain/version prefix are Noema application-level canonicalization rules, not a new hash algorithm. Runtime conformance is exercised against standard short, padding-boundary/multi-block, and million-byte SHA-256 vectors in addition to the application-domain known vector and semantic-field sensitivity tests. No Node compatibility flag and no new cryptographic dependency are introduced by this decision.

This port is a test double and Anti-Corruption Layer until an immutable `context-graph-contracts` release exists. Noema does not copy plugin source, install the marketplace, or treat Anthropic review as CWL trust.

The decision follows least privilege and complete mediation (Saltzer & Schroeder, 1975), fail-closed verification of untrusted software components (National Institute of Standards and Technology, 2022), and the current SHA-256 Secure Hash Standard (National Institute of Standards and Technology, 2015). Cloudflare Workers documents Web Crypto through `crypto.subtle` and an asynchronous digest operation; that runtime interface is used as the primitive boundary rather than duplicating the algorithm in Noema.

## Consequences

Operators can reject hostile plugin metadata, self-asserted approval grants, backdated attempts to reuse expired authority, cross-admission replay, and divergent replay envelopes deterministically without waiting for foreign GA. Invocation now depends on immutable source/scanner identity, an explicitly supplied Noema product/role/time policy grant, current runtime time being inside that grant, exact admission provenance, and a fixed-width replay digest. Revoking, changing, expiring, replacing, or omitting the applicable authority prevents new activation or invocation.

The lifecycle aggregate adds restart-readable evidence that is deliberately narrower than foreign-owner state. Buyers/operators can audit the exact Noema transition chain and detect stale/conflicting replay without reconstructing authority from issue prose or process-local maps. It also creates storage-growth, contention, recovery, and retention obligations: the compact current projection cannot substitute for complete audit continuity, and unit-test timing cannot be used as p95 evidence.

The replay WeakMap no longer extends the lifetime of reversible request plaintext merely to support equality. A process restart intentionally loses invocation-envelope replay-digest authority; the safe recovery behavior is to reject retained invocation receipts whose local binding no longer exists rather than recreate trust from receipt fields alone. That fail-closed invocation behavior is separate from the durable lifecycle event stream. There is no plaintext-data migration path for this candidate because the prior representation was never protected or released.

The public success/replay path is now asynchronous at the cryptographic publication boundary. Callers must await the returned promise before consuming an accepted receipt. Pre-digest validation errors remain synchronous so malformed or unauthorized work is rejected before cryptographic work is scheduled. This API change is confined to the still-Draft external-extension candidate and therefore does not mutate a released compatibility contract.

The cost is a local descriptor/policy/canonicalization adapter plus a lifecycle repository and reliance on the Worker runtime Web Crypto provider. Noema no longer carries a home-grown security-critical hashing primitive or repository-minted foreign-owner evidence placeholders. AppGuardrail and quarantine receipts remain pins, not proof that those owners completed their own product work; EgressWeave and quarantine references remain references, not Noema-operated outbound or isolation control.

## Rejected alternatives

- **Wholesale marketplace installation:** rejected because unreviewed connectors would inherit runtime authority.
- **Trust Anthropic catalog review as CWL admission:** rejected because upstream review is not this organization's authority.
- **Treat scanner receipts as product approval:** rejected because artifact analysis does not issue Noema product/role/time authority.
- **Ship source-default pilot Policy / Approval with synthetic owner digests:** rejected because test placeholders or unreleased foreign-owner identities cannot become immutable production authority.
- **Trust caller event timestamps as current authorization time:** rejected because a caller could backdate activation or invocation after expiry.
- **Retain normalized invocation JSON as replay fingerprint:** rejected because equality does not require reversible retention of instruction/content/secret-like inputs.
- **Hash only a subset of invocation fields:** rejected because a replay could then change omitted semantics under the same retained identity.
- **Implement SHA-256 directly in Noema:** rejected because it creates unnecessary security-critical primitive ownership and a separate correctness/audit surface outside the bounded-context responsibility.
- **Add a new synchronous cryptographic dependency solely to preserve a provisional sync API:** rejected for this candidate because the Worker platform already supplies the standard primitive and the external-extension API is not released. A future performance or portability requirement may revisit this only through a separate ADR and immutable dependency review.
- **Publish a receipt before asynchronous digest success:** rejected because digest-provider failure would then occur after authority publication instead of failing closed.
- **Silently reinterpret old replay bindings after a digest/canonicalization change:** rejected because replay authority must be versioned and exact.
- **Trust descriptor `approval_status` and allowlists after admission provenance is sealed:** rejected because object provenance proves which function admitted the descriptor, not who issued its policy fields.
- **Copy plugin source into Noema or product repositories:** rejected because it creates a mutable foreign system of record.
- **Use the bounded workflow transition-receipt ring as the lifecycle audit ledger:** rejected because observability retention intentionally discards old receipts and therefore cannot prove buyer audit continuity.
- **Store one repository-global lifecycle stream:** rejected because it creates a hot partition and couples unrelated extension/artifact contention and retention.
- **Re-read mutable owner evidence on every exact committed lifecycle replay:** rejected because historical committed events are evidence, not live authority. Fresh evidence remains mandatory for genuinely new activation.
- **Scan the complete lifecycle history on every current-state read:** rejected because current projection and audit/recovery have different latency/cardinality requirements; complete chain verification belongs on audit/recovery while the current path verifies its bound tail.
- **Wait for `context-graph-contracts` GA before any Noema port:** rejected because a local fail-closed ACL is independently verifiable and can later consume the released contract.
- **Allow product-runtime Claude plugin wrappers:** rejected because product execution must use product-owned protocol/API ports, not community plugin packaging.

## Acceptance

This ADR remains `Proposed` until the local port and durable lifecycle slice are protected source, unchanged exact-head CI/security/review/image evidence is terminal clean, and later slices bind immutable shared-contract consumption, AppGuardrail successor evidence, release evidence, rollback/recovery rehearsal, and measured pilot activation. Source tests do not prove live plugin installation, isolation runtime operation, outbound enforcement, or buyer completion of issues #545/#561.

Policy / Approval acceptance specifically requires hostile evidence that self-broadened status/product/role/validity/isolation/egress grants are rejected; missing/malformed/throwing/revoked/drifted policy authority and omitted explicit Policy / Approval pins fail closed; synthetic owner-profile digest placeholders cannot authorize admission; activation policy-version mismatch, pre-activation invocation timestamps, and backdated activation/invocation after the actual runtime validity window are rejected; authentic activation/receipt authority cannot cross exact admissions; replay equality retains a versioned domain-separated SHA-256 digest that binds every semantic invocation field without plaintext retention; runtime SHA-256 passes standard short, padding/multi-block and long-message vectors; no repository-owned hash primitive remains; digest failure cannot publish an accepted receipt; and an unchanged explicitly issued grant still permits the intended narrow developer-assist path.

Lifecycle acceptance requires hostile restart/recovery, concurrent CAS, exact replay/different-semantics conflict, illegal transition, forged/stale state, pre-append evidence drift, rollback/suspension/supersession, malformed/truncated/tampered event/head/snapshot, secret/product-data retention, cross-extension/artifact substitution, >128-transition audit continuity, digest interleaving, transaction-time replay races, and exact activation commit-versus-evidence-revocation behavior. Owned source/docstring/test/edge coverage remains 100%. The actual Durable Object backend must separately demonstrate current-projection and contended-append p95, partition/lock behavior, storage growth, snapshot rebuild, rollback/suspension and recovery; unit tests and algorithmic O(1) cardinality are not substitutes. PRD/TRD/ARCHITECTURE/Context Map/UML/TRACEABILITY/TEST_STRATEGY/OPERABILITY/recovery must be code-current before protected integration. Immutable release, deployment, pilot, and production KPI evidence remain separate acceptance layers.

## References

National Institute of Standards and Technology. (2015). *Secure Hash Standard (SHS)* (Federal Information Processing Standards Publication 180-4). https://doi.org/10.6028/NIST.FIPS.180-4

National Institute of Standards and Technology. (2022). *Secure software development framework (SSDF) version 1.1: Recommendations for mitigating the risk of software vulnerabilities* (NIST Special Publication 800-218). https://doi.org/10.6028/NIST.SP.800-218

Saltzer, J. H., & Schroeder, M. D. (1975). The protection of information in computer systems. *Proceedings of the IEEE, 63*(9), 1278–1308. https://doi.org/10.1109/PROC.1975.9939
