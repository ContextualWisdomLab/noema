# Procedural graph adoption: source evidence and integration gates

Status: Proposed implementation and rollout record, not release or deployment acceptance.
Date: 2026-09-10.

This record accompanies [ADR-0017](../adr/0017-procedural-graph-guidance.md),
[Noema #584](https://github.com/ContextualWisdomLab/noema/issues/584),
[core #585](https://github.com/ContextualWisdomLab/noema/pull/585), and
[lifecycle #586](https://github.com/ContextualWisdomLab/noema/pull/586).
The organization work item is [CWL #2067](https://github.com/ContextualWisdomLab/.github/issues/2067).
The canonical EA adoption matrix belongs to enterprise-architecture-core, not this document.

Protected source integration: #585 and #586 are merged on protected `main`.
This is source-integration evidence only. ADR 0017 remains `Proposed`, candidate screening remains
`activationAuthorized: false`, and release, deployment, authenticated evaluation, durable promotion,
shadow/canary, rollback and product-outcome evidence remain separate authorities.

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
| Execution lifecycle | Given fresh authenticated lifecycle state, only a running execution receives advice. Accepted, cancelling and terminal executions do not evaluate the neighborhood request. The pure adapter is not a durable revocation store and cannot detect replay of an old running snapshot. |
| Candidate comparison | Require exact base/candidate lineage, matching evaluation context, complete paired cases, disjoint train/holdout IDs and finite normalized scores. Reported candidate safety violations block eligibility regardless of mean gain. |
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

Protected source subsequently integrated #585 as merge commit
`3f5aad19e6bb9231ec6bde9724ad0bd51752bf9f` and #586 as merge commit
`ae525cdc4ecc28e6caf5e5a45809f568388b3f7f`. #586 exact head
`5351723f4ce3c2d41d463555986ba49e6c8f0f20` had terminal-success application CI,
reviewer CI, central Security Scan and patch-validator-image before normal merge.
These observations establish protected source integration; they do not establish an
immutable release, deployed runtime behavior, graph effectiveness or rollout authority.

## Owner-led rollout and exit criteria

| Stage | Responsible owner and concrete next delivery | Exit evidence |
| --- | --- | --- |
| Source readiness | Noema: keep the integrated #585/#586 core and lifecycle adapter aligned with canonical Agent Runtime boundaries while repairing code-current documentation drift. | Protected merge ancestry plus unchanged exact-head typecheck, full tests/coverage, applicable security/image checks and review; source integration is complete but does not satisfy later rollout stages. |
| Interchange release | context-graph-contracts #28: graph/context/evaluation/decision schema, digest semantics and hostile conformance fixtures. | Immutable released contract and compatible independent consumer fixtures. Local `noema.procedural-graph/v1` is not already that release. |
| Ownership inventory | enterprise-architecture-core #50: task/profile owner, consumer port, contract pin, evaluation profile and rollback owner for each applicable product. | Evidence distinguishes proposed, source, released, shadow, canary, active and rollback-tested. Deterministic kernels may be not applicable with a recorded reason. |
| First shadow connection | contextual-orchestrator #1116 plus .github and Naruon owners: connect guide/solver roles through the existing gateway without write-side activation. | Observed matched no-graph/fixed-graph/evolved-graph runs; task success, sequencing errors, duplicate effects, cost/tokens and latency reported separately. |
| Independent evaluation | psychometrics-commons #447: task stimuli, item/rubric definitions, paired evidence protocol, validation-search and untouched final confirmation separation. | Authenticated producer and exact graph/model/tool/dataset/rubric/context binding; justified evidence size and uncertainty; independent acceptance. |
| Offline state integration | Noema State/Checkpoint and Policy/Approval: minimized observations, candidate storage, scoped rejection retention, approval, compare-and-swap promotion, rollback and revocation. | Crash/replay/stale-writer tests and authentic approval/evidence references; running sessions keep their pinned revision and obey current revocation. |
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

There is no production graph/trajectory store, signed receipt verifier, automatic
refiner, independently approved promotion API or product invocation in protected
source. There is also no evidence yet that graph guidance improves CWL tasks or meets
product latency targets. The owning root product/technical baseline must retain
these gaps and link this record without replacing historical results. Do not mark
ADR-0017 Accepted, publish a release, or advertise organization-wide activation
from source integration or the existence of tracking issues.

## References

Lu, Y., Chen, Y., Wu, S., & Arık, S. Ö. (2026). *Procedural graphs: Self-evolving
execution structures for LLM agents* [Preprint]. arXiv.
https://doi.org/10.48550/arXiv.2609.09153

코난쌤. (2026, September 10). *Procedural Graph: LLM 에이전트를 위한 자가진화
절차 그래프 (arXiv 2609.09153) 논문 정리*. 코난쌤 블로그.
https://conanssam.com/posts/2026-09-10-procedural-graphs-self-evolving-llm-agents
