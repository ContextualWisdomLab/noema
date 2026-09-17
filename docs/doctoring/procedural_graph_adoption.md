# Procedural graph adoption: source evidence and integration gates

Status: Proposed implementation and rollout record, not release or deployment acceptance.
Date: 2026-09-10.

This record accompanies [ADR-0017](../adr/0017-procedural-graph-guidance.md),
[Noema #584](https://github.com/ContextualWisdomLab/noema/issues/584),
[core #585](https://github.com/ContextualWisdomLab/noema/pull/585),
[lifecycle #586](https://github.com/ContextualWisdomLab/noema/pull/586),
[current-state ACL #589](https://github.com/ContextualWisdomLab/noema/pull/589),
[durable evaluation history #597](https://github.com/ContextualWisdomLab/noema/pull/597),
[State / Checkpoint transaction hardening #714](https://github.com/ContextualWisdomLab/noema/pull/714),
[Policy / Approval CAS #601](https://github.com/ContextualWisdomLab/noema/pull/601), and
[Policy / Approval transaction hardening #719](https://github.com/ContextualWisdomLab/noema/pull/719).
The organization work item is [CWL #2067](https://github.com/ContextualWisdomLab/.github/issues/2067).
The canonical EA adoption matrix belongs to enterprise-architecture-core, not this document.

Protected source integration: #585, #586, and #589 are merged on protected `main`;
#597 is merged on protected `main` as the State / Checkpoint durable-history slice;
#714 is merged on protected `main` as the same owner's minimal-transaction,
complete-revalidation, handoff-freshness, and non-coercing digest-admission hardening;
#601 is merged on protected `main` as the Noema Policy / Approval CAS slice; and
#719 is merged on protected `main` as that same Policy / Approval owner's
pretransaction retained-chain verification, complete transaction-local revalidation,
and non-coercing identity/digest-admission hardening.
This is source-integration evidence only. ADR 0017 remains `Proposed`, candidate screening remains
`activationAuthorized:false`, and release, deployment, live Keyverse trust selection,
graph publication/activation, shadow/canary, rollback and product-outcome evidence remain
separate authorities. The workflow-backed current-state ACL, bounded durable evaluation/rejection
history, and Policy / Approval CAS ledger are protected source; this record does not promote any
of those source integrations into release, deployment, graph publication, or activation truth.

## What the sources support

Lu et al. (2026) represent procedural knowledge using procedure/relation/procedure
triples. At each decision step, an active procedure is localized and a guidance
model translates its neighboring subgraph into situational advice. The solver is
influenced by that advice, not replaced by a hard graph controller. During offline
self-evolution, a refiner compares failed and successful task trajectories and
proposes graph edits. Held-out validation screens edits for non-decreasing measured
performance; rejected edits are retained. The graph remains fixed during inference.
These are method claims from the authors' arXiv preprint submitted 2026-09-08, not
peer-reviewed findings or observations from CWL deployments. The Korean blog below
motivated this adoption request; the primary method reference is the paper rather
than the blog's interpretation or comparative scores.

## CWL decisions, not claims made by the paper

| Concern | CWL adaptation and observable acceptance |
| --- | --- |
| Advice versus authority | Graphs and contexts cannot invoke tools or authorize execution, credentials, approval, merge, publication or deployment. Candidate screening always returns `activationAuthorized: false`. |
| Scope and identity | Graph tenant/task/digest are compared exactly. Execution IDs use Noema's existing `isCanonicalExecutionId`, not the narrower graph-node grammar. Graph identity and execution identity are different contracts. |
| Local object admission | Only frozen graph sessions issued by the owning module may enter the lifecycle adapter. Copied objects, proxy wrappers and forged callbacks are rejected before session property access. This is local object integrity, not caller authentication. |
| Unknown or oversized neighborhood | Return unavailable advice for `unknown_procedure` or `context_budget_exceeded`; do not turn abstention into success, return the entire graph, or silently drop prerequisite relationships. |
| Execution lifecycle | The protected pure adapter accepts only a caller-supplied fresh authenticated lifecycle snapshot. For workflow-backed sessions, protected #589 re-reads the existing execution-scoped `NOEMA_WORKFLOW_STATE` owner before every guidance decision and suppresses advice when newer cancellation, terminal, or pre-start durable evidence exists. This is a conservative guidance projection, not a second Agent Runtime lifecycle store. |
| Candidate comparison | Require exact base/candidate lineage, matching evaluation context, complete paired cases, disjoint train/holdout IDs and finite normalized scores. Reported candidate safety violations block eligibility regardless of mean gain. |
| Evaluation identity and authentication | Protected #592/#593 bind paired receipt semantics and evaluator/profile evidence into canonical digests; protected #594 verifies a separately authenticated P-256 ECDSA evaluator handoff selected by the composition root; protected #596 also binds rejection key, screening disposition and approval eligibility. These source contracts do not move Keyverse key custody or signer selection into Agent Runtime. |
| Durable evaluation/rejection history | Protected #597 stores only admitted graph/evaluation/authenticated signed-claim identities and bounded rejection evidence under State / Checkpoint. Protected #714 performs complete retained-chain cryptographic verification, rejection-context derivation and next-event SHA-256 before the storage transaction; inside the short transaction it re-reads current retained state, requires canonical structured-clone shape and complete equality with the preverified structure, rechecks authenticated handoff freshness immediately before durable `put` or exact replay return, and admits retained digest fields only as canonical lowercase 64-hex strings without coercion. Monotonic CAS, exact replay, restart reconstruction, digest-chain integrity, duplicate-handoff refusal and fail-closed 128-event capacity preserve retained evidence without creating a second Workflow / Task or lifecycle truth. Policy / Approval remains a separate bounded-context authority. |
| Policy / Approval | Protected #601 consumes only an admitted current State / Checkpoint snapshot and an independently supplied exact policy decision, then binds graph/history/evaluator identities through monotonic approval-version CAS, exact replay and explicit revocation. Protected #719 moves complete retained approval-chain cryptographic verification and immutable next-event SHA-256 derivation before the storage transaction; inside the short transaction it re-reads current retained approval state, requires canonical root/event/dense-array structured-clone shape, compares the complete current retained structure with the exact preverified structure using field-by-field/`Object.is` equality, and performs only exact replay return or one durable write. Retained identity/digest values must already be canonical strings before regex/hash use; coercible non-string lookalikes fail closed as `ProceduralPolicyApprovalConflictError` instead of gaining authority through JavaScript coercion. Every event and snapshot remains `activationAuthorized:false`; Keyverse custody, graph publication and activation stay outside this ledger. |
| Independent acceptance | Arithmetic non-regression is not statistical significance, construct validity, standard setting or approval. Independent evaluation and final confirmation remain prerequisites. |
| Data and secrets | No new credential, `.env` read, provider client, raw trajectory store or hidden-reasoning capture is introduced. Guidance text is still untrusted data; these modules do not detect prompt injection or scrub sensitive content. |

## Concrete repair evidence

The initial native core run at `5813ee1cb8958aa25e622fe31adfa8dc229f2e3c`
passed typecheck but failed the public API documentation inventory. Its 4,443
passing tests did not make the remaining failure acceptable. Subsequent source
changes documented exports, moved the colliding procedural ADR from 0016 to 0017,
and recorded the behavior under Unreleased without weakening those gates.

The session producer repair at `9056eb24b0841c12c807464ea8ecc5e557222c05`
adds `assertProceduralSession`. Its valid delta is retained, not replaced with a
second session-admission implementation. The parent repair at
`a99b8615c0959252e6fa78029203e9983f840356` reuses canonical execution identity
and adds strict session-admission regressions. Concurrent child integration
`fa4b0fd7598a1308015bbd0f4a897c1c9e19bc15` preserves both parent and child
history by an ordinary merge.

Against the child's unchanged source blob
`8f70e36e7780f26ee3a414a14a4fd955ad201fe2`, the expanded local battery
reported 138 passing and two failing assertions: both graph-abstention results
were advertised as available. The repair preserves the owner's session-admission
assertion and propagates the two abstention reasons with `available: false` and
`context: null`. Redundant checks of identities constructed by the already-admitted
frozen closure are removed; the lifecycle/session identity comparison remains.

The final local battery passed 140 assertions with no failures or skips. It used
Node 22.16.0 and TypeScript 5.8.3, strict compiled source, and a mechanical Vitest
import-to-`node:test` adapter. The lifecycle import was represented by its existing
type shape for this isolated build; this battery does not execute the complete
lifecycle runtime or original child lifecycle integration suite. Native repository
Node/npm/Vitest tests, all coverage thresholds, security, review and deployment
checks remain independent requirements. No CI threshold, lockfile or runtime
version was altered to turn this diagnostic result into acceptance.

Protected source integrated #585 as merge commit
`3f5aad19e6bb9231ec6bde9724ad0bd51752bf9f` and #586 as merge commit
`ae525cdc4ecc28e6caf5e5a45809f568388b3f7f`. #586 exact head
`5351723f4ce3c2d41d463555986ba49e6c8f0f20` had terminal-success application CI,
reviewer CI, central Security Scan and patch-validator-image before normal merge.
Those observations establish protected source integration; they do not establish an
immutable release, deployed runtime behavior, graph effectiveness or rollout authority.

#589 started from the later protected documentation convergence and used test-first
`8565dd32c2111b1f06a91f36bd2d7928834b97e2` to require a fresh durable read for
each workflow-backed guidance decision. The causal source reuses the private
execution-scoped Workflow / Task Execution `read` command rather than adding another
database or mutation endpoint. Its tests deliberately replay a first current response
that permits advice followed by a newer cancellation response and require the second
decision to suppress advice. Exact head `5114729fac942b990368ccfb987f9d2ea267c1a3`
received terminal-success application CI, reviewer CI, central Security Scan and
patch-validator-image before normal merge. Resulting protected merge
`0e899886b039ed27f71bdbc4540ea266b8ef9aed` preserves the previous protected main
and that exact PR head as parents. This proves source integration only; deployed
Durable Object compatibility, restart behavior, availability and synchronous buyer-path
latency remain separate evidence.

#597 introduced the State / Checkpoint retention slice test-first. Predecessor exact
`c2ee6ba195182a1a8fb2da7d55656e66e45207c5` produced a real application-CI RED:
all 4,575 tests passed, but the repository-wide 100% coverage gate exposed the
unexercised retained-history `previously_rejected` integrity arm. Causal successor
`943d06defa6df274cb3b25d20861012725202f60` added restart/read evidence for that
persisted disposition instead of excluding the branch from coverage, and
`9e7237ed2fe92fca779aee2d7c30fce1f38b09b6` added the required Unreleased behavior
record. The unchanged final exact then received terminal-success application CI,
reviewer CI, central Security Scan and patch-validator-image before normal merge as
`61f2b372d55c87e1763bc11d3e545967fc0a9cf5`. The merge preserves previous protected
main and the exact PR head as parents. This proves source integration and retained
State / Checkpoint semantics only; deployed Durable Object compatibility, Policy /
Approval decision state, production graph activation and measured task benefit remain
separate evidence.

#714 hardened the protected #597 State / Checkpoint history path without moving
cryptographic authority, Policy / Approval, Workflow / Task, provider routing,
quarantine/security, outbound, credential, publication, release, or deployment truth
into that context. Exact source `a1228e72565d4280d01e1f877377ee0d3e107178`
received terminal-success application CI, reviewer CI, required Security Scan and
patch-validator-image before normal merge as GitHub-verified
`159758c16f92dafb884d176fdbf23cb0f5bd69f7`. Complete retained-chain verification
and next-event hashing now occur outside the transaction; the transaction-local
current-state reread must equal the complete canonical preverified retained structure,
authenticated handoff freshness is checked again immediately before durable authority,
and retained SHA-256 scalars must be canonical strings before cryptographic use.
Hostile regressions cover legal concurrent append, post-verification drift, exact-replay
drift, JSON-invisible fields, sparse arrays, handoff expiry, complete retained-state
CAS drift, and coercible non-string digest corruption. This remains source/test proof,
not deployed Durable Object contention/restart/recovery or buyer-path p95/heap evidence.

#601 introduced the Policy / Approval slice test-first and kept it in Noema's existing
Policy / Approval bounded context. A later exact `8dc6f9172812b3e013e53c61a13f89302ffb3b2f`
produced a real application-CI RED after exact checkout, install and typecheck: the
request builder rejected a current authenticated `score_regression` history before the
independent policy action was known, so an already-approved pilot could not be revoked
against the newest evidence. Causal `751d6e27c2f1397bd283e5f211b6b39e53aa5577`
keeps exact graph/history/evaluator provenance checks common to both actions but limits
approval eligibility/non-regression checks to `approve_for_pilot`. `revoke` still
requires current admitted history, an exact independent decision, monotonic
approval-version CAS and an already-approved prior state. The final exact received
terminal-success application CI, reviewer CI, central Security Scan and
patch-validator-image before normal merge as `1742bb9be40b2587d54c1194c539b863abb11d22`.
All retained events/snapshots remain `activationAuthorized:false`; this proves source
integration only, not publication, activation or deployment.

#719 hardens that protected #601 Policy / Approval ledger under the same bounded-context
owner. Exact source `de91e24fdac66c9963c92ca77971d870a48778e4` received terminal-success
application CI, reviewer CI, required Security Scan and patch-validator-image plus a
clean current-head review before GitHub-verified normal merge
`4433c3009d4c6bc900bf5c8346f75b07185ff985`. Complete retained approval-chain
verification and next-event SHA-256 derivation now occur before the storage transaction;
the transaction-local reread must preserve canonical root/event/dense-array shape and
complete equality with the exact preverified retained structure, using `Object.is`
semantics where scalar identity matters. Runtime-untrusted retained identity/digest
values must already be canonical strings before regex/hash use; coercible non-string
lookalikes fail closed as `ProceduralPolicyApprovalConflictError`. Hostile regressions
cover transaction-active digest instrumentation, a legal interleaving winner,
post-verification internal event drift, JSON-invisible append/replay fields, sparse or
compensating arrays, coercible non-string digest/identity values and event-cardinality
drift. Exact replay, approve/revoke rules, capacity, stale-writer rejection and
`activationAuthorized:false` remain unchanged. This is protected source/test/merge
evidence only, not immutable release, deployed Durable Object recovery/contention,
buyer-path p95/heap, graph publication or activation evidence.

## Owner-led rollout and exit criteria

| Stage | Responsible owner and concrete next delivery | Exit evidence |
| --- | --- | --- |
| Source readiness | Noema: keep protected #585/#586/#589/#597/#714/#601/#719 behavior aligned with canonical docs without crossing Workflow / Task, Agent Runtime, State / Checkpoint or Policy / Approval ownership. | Protected ancestry plus unchanged exact-head typecheck, full tests/coverage, applicable security/image checks and review. |
| Interchange release | context-graph-contracts #28: graph/context/evaluation/decision schema, digest semantics and hostile conformance fixtures. | Immutable released contract and compatible independent consumer fixtures. Local `noema.procedural-graph/v1` is not already that release. |
| Ownership inventory | enterprise-architecture-core #50: task/profile owner, consumer port, contract pin, evaluation profile and rollback owner for each applicable product. | Evidence distinguishes proposed, source, released, shadow, canary, active and rollback-tested. Deterministic kernels may be not applicable with a recorded reason. |
| First shadow connection | contextual-orchestrator #1116 plus .github and Naruon owners: connect guide/solver roles through the existing gateway without write-side activation. | Observed matched no-graph/fixed-graph/evolved-graph runs; task success, sequencing errors, duplicate effects, cost/tokens and latency reported separately. |
| Independent evaluation | psychometrics-commons #447: task stimuli, item/rubric definitions, paired evidence protocol, validation-search and untouched final confirmation separation. | Authenticated producer and exact graph/model/tool/dataset/rubric/context binding; justified evidence size and uncertainty; independent acceptance. |
| Durable state and approval | Noema State / Checkpoint and Policy / Approval: protected #597 provides bounded durable evaluation/rejection history; protected #714 keeps retained cryptography outside the short atomic section while requiring complete current-state equality, second handoff-freshness validation and non-coercing digest admission before durable authority; protected #601 binds an independently supplied decision to exact graph/history/evaluator identities with monotonic approval-version CAS, exact replay and explicit revocation; protected #719 gives that approval ledger the same pretransaction retained-chain verification, complete transaction-local revalidation and non-coercing identity/digest admission discipline. Publication/activation must independently re-read current cross-authority state. | Crash/replay/stale-writer history evidence plus authentic approval references; current regression can revoke an approved pilot; running sessions keep their pinned revision and obey current revocation at the publication/activation boundary. |
| Product canary | Product owners: versioned adapter and domain-specific procedure/profile; no copied graph runtime. | Released contract conformance, observed invocation, domain regressions, independent side-effect controls and tested disable/rollback. |

The first product scenarios are central review/finding verification and Naruon's
read-only task handling. Candidate later scenarios include Bandscope analysis
review, TEPP research workflow, Orgmetra assessment preparation, accounting close
review, billing reconciliation, supply-chain exception handling, learning-content
review and Inkspan document preparation. These are proposed use cases, not a
claim that those products currently call this library. Employment decisions,
accounting postings, charges, data deletion and deployment retain their own policy
and human-approval boundaries. Domain facts remain with their original owners.

Model work stays behind contextual-orchestrator. Model-backed Actions use only
`orchestrator/free`; provider selection and free-pool fallback remain inside that
owner, with Keyverse holding credential authority. This work adds neither a paid
fallback nor an application-wide model timeout. Graph traversal limits are data
bounds, not elapsed-inference-time limits. No new scheduler or organization fanout
is necessary for this source slice.

## Remaining gaps that block active adoption

The protected workflow-backed current-state ACL does not persist Agent Runtime
lifecycle state and does not make Workflow / Task Execution the lifecycle owner.
It only prevents a cached procedural `running` decision from surviving newer durable
workflow evidence that proves cancellation, terminal work, or pre-start state.
Non-workflow executions still need an authenticated current lifecycle source. The
deployed Durable Object read path and the #597/#714 durable-history/#601/#719 approval
paths also still need real runtime compatibility/restart evidence and buyer-path p95
measurement; source and fake-Durable-Object tests are not latency evidence.

Protected source now includes a separately authenticated signed evaluator-handoff
verifier, bounded durable evaluation/rejection history with #714 minimal-transaction
hardening, provenance-preserving history reads, and the #601 Policy / Approval CAS
ledger hardened by #719's pretransaction verification, complete transaction-local
revalidation and non-coercing identity/digest admission. It still has no production
graph publication/trajectory store, live Keyverse trust-selection wiring, automatic
refiner, product invocation, or activation composition that freshly reconciles State /
Checkpoint and Policy / Approval before publishing or activating a revision. There is
also no evidence yet that graph guidance improves CWL tasks or meets product latency
targets. The owning root product/technical baseline must retain these gaps and link
this record without replacing historical results. Do not mark ADR-0017 Accepted,
publish a release, or advertise organization-wide activation from source integration
or the existence of tracking issues.

## References

Cloudflare. (2026). *Durable Object storage*. Cloudflare Developers.
https://developers.cloudflare.com/durable-objects/api/storage-api/

Cloudflare. (2026). *Invoke methods*. Cloudflare Developers.
https://developers.cloudflare.com/durable-objects/best-practices/create-durable-object-stubs-and-send-requests/

Lu, Y., Chen, Y., Wu, S., & Arık, S. Ö. (2026). *Procedural graphs: Self-evolving
execution structures for LLM agents* [Preprint]. arXiv.
https://doi.org/10.48550/arXiv.2609.09153

코난쌤. (2026, September 10). *Procedural Graph: LLM 에이전트를 위한 자가진화
절차 그래프 (arXiv 2609.09153) 논문 정리*. 코난쌤 블로그.
https://conanssam.com/posts/2026-09-10-procedural-graphs-self-evolving-llm-agents
