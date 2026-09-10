# ADR-0017: Advisory procedural graphs with offline candidate screening

Status: Proposed. A source implementation on a feature branch is not protected-source,
release, or deployment acceptance.

Date: 2026-09-10

Tracking: [CWL adoption](https://github.com/ContextualWisdomLab/.github/issues/2067),
[Noema implementation](https://github.com/ContextualWisdomLab/noema/issues/584).

## Context and alternatives

Lu et al., *Procedural Graphs: Self-Evolving Execution Structures for LLM Agents*,
[arXiv:2609.09153v1](https://arxiv.org/html/2609.09153v1), sections 3.1–3.3,
externalizes procedural knowledge as procedure/relation/procedure triples. Local
subgraphs inform the solver; offline edits are checked on held-out tasks and rejected
edits retained. The graph stays fixed during an execution. This is a method reference,
not CWL benchmark evidence or permission to modify production controls. The adoption
request originated in [this article](https://conanssam.com/posts/2026-09-10-procedural-graphs-self-evolving-llm-agents).

Keeping only longer prose playbooks loses explicit connectivity. Replacing every
workflow with a self-editing hard controller would conflate advice with authority and
duplicate existing policy, tool, and lifecycle owners. Choose a small advisory value
and evidence-screening port within Noema's Agent Runtime bounded context instead.

## Decision and owned implementation

`src/agent-runtime/procedural-graph.ts` owns an immutable graph and a closure pinned
to an execution ID and exact graph digest. `procedural-evolution.ts` screens supplied
paired evaluation evidence. `procedural-input.ts` shares only strict data readers and
content hashing inside this aggregate; it is not a generic organization utility.
No HTTP route, `/exchange` change, OIDC trust expansion, persistence binding,
provider client, credential, package dependency, or workflow is introduced.

The local schema is `noema.procedural-graph/v1`, not a released CWL wire contract.
Nodes have canonical identifiers, including `Start`. Directed edges carry `from`,
`relation`, `to`, `condition`, `guidance`, and `pitfalls`; supported relation labels
are `leads_to`, `requires`, and `enables`. Labels and text are advisory data, not
executable conditions or a dependency scheduler. Cycles and isolated nodes are
permitted; product-specific terminal reachability and cycle policy need a later
profile validator. Unknown fields, duplicate nodes/triples, missing endpoints,
accessors, sparse arrays, and malformed identities fail closed.

Bounds are 256 nodes, 512 edges, 128-character identifiers, 2048 UTF-16 code units
per text field, and 1 MiB per hashed serialization. Canonical JSON key order and
sorted nodes/triples define this local implementation's digest; this is not a claim
of RFC 8785/JCS interoperability. Full identity includes tenant, task, graph ID,
revision, parent digest, and content. The structure digest excludes revision and
parent only. All raw fields are copied before asynchronous hashing and deep-frozen.
Deserialized objects must be reconstructed and rehashed, not cast to trusted values.

`startProceduralSession` requires an exact tenant/task/digest match and pins the
selected graph for the caller's execution. It does not authenticate a tenant or
register an execution: the trusted caller must do that. Each `context` request must
supply `lastProcedure`, `hops` (1–4), and `maxEdges` (1–512). Null procedure selects
`Start`; two hops is the initial consumer recommendation, not a universal optimum.
Traversal follows outgoing edges and terminates safely on cycles. Unknown nodes or
an exceeded edge budget produce an empty `abstain` result rather than the paper's
full-graph fallback or a silently truncated prerequisite set. This intentional
CWL adaptation needs comparison in the shadow pilot.

Every context says `authority: advisory_only`. Text may still contain hostile
instructions or sensitive content; this module is neither a prompt-injection
classifier nor a secret/PII scrubber. Admission, minimization, taint handling,
external-instruction precedence, tool allowlists, policy approval, tenant auth,
cancellation, and side-effect idempotency remain enforced outside the graph.

## Offline evidence screening

`assessProceduralCandidate` accepts two admitted graphs, a pre-registered evaluation
plan, two receipts, and scoped rejected keys. Candidate tenant/task/graph identity,
parent digest, and exactly-next revision must match the retained base. Receipts
must name those exact graph digests and the same evaluation-context digest.
The validator owner defines and authenticates that context, including dataset
version, model, decoding, tools, metric/rubric, execution environment, and protocol.
This module validates equality and shape, not issuer signatures or semantic
completeness of that digest. Unauthenticated client receipts cannot be activation
or governance evidence.

Training and held-out IDs must be disjoint, unique, and bounded to 10,000 per list.
Both receipt case sets must equal the complete registered holdout; scores must be
finite numbers in [0,1]. The externally selected minimum case count is enforced.
There is no default claim that two or any other small number of cases proves
validity. Missing cases, changed contexts, or non-finite scores are errors.

Unchanged content and previously rejected content are ineligible. Any reported
candidate safety violation is ineligible even if its mean score rises. Otherwise,
the candidate's paired-case mean must not decrease. This deterministic screening
rule is not statistical significance, a noninferiority study, calibrated evaluation,
or evidence that every subgroup/metric is non-regressing. Those gates belong to the
evaluation profile and independent validator. Repeated validation feedback can
still overfit: the final test set must stay untouched by the refiner and promotion
search, with independent confirmation before deployment.

The rejection signature binds the exact base digest, candidate structure,
evaluation context, minimum count, and canonical training/holdout partition.
Array reordering cannot evade a recorded rejection; changed evaluation conditions
do not inherit a global blacklist. Returning a key does not persist it, and does
not disclose holdout examples to a refiner. The later State/Checkpoint adapter
owns authenticated retention and versioned rejection history.

Even a passing result returns `activationAuthorized: false`. `eligibleForApproval`
means only that supplied evidence passed this local screening. It cannot publish,
activate, invoke tools, bypass review, edit policies, or grant credentials. Promotion
requires independent approval tied to graph/evidence digests, policy/security
checks, compare-and-swap against the retained head, rollback, and revocation.
Existing executions must keep their pinned revision and separately honor revocation.

## CWL ownership and rollout

| Owner | Planned responsibility; not a claim of deployed integration |
| --- | --- |
| Noema | Graph snapshot, guidance context, offline screening; later lifecycle/state adapters |
| context-graph-contracts | Released language-neutral schemas, digest rules, conformance fixtures |
| enterprise-architecture-core | Capability/owner map, versioned adoption matrix and evidence classes |
| contextual-orchestrator | Existing gateway routing for later guide/solver/refiner calls; no client-side provider fallback |
| keyverse | Credential authority; graph/evaluation records contain no raw credential values or `.env` dependency |
| PolicyWeave, governance-risk-compliance, Noema Policy/Approval | Separate policy truth, risk/evidence, and approval boundaries |
| appguardrail, quarantine-sandbox-runtime, EgressWeave, wardnet | Existing detection, isolation, outbound, and endpoint control ownership |
| OriginWeave, LineageWeave | Sanitized observations and immutable provenance references, not copied foreign truth |
| psychometrics-commons / evaluation owner | Task-specific measures, rubric and standard-setting separation, held-out protocol and uncertainty |
| .github and product owners | Central development profile and product-specific procedural graphs/adapters/tests |

1. Implement and review this deterministic core without enabling a production path.
2. Have contract/EAC owners release interoperable schemas and ownership records.
   Do not consume mutable sibling PR heads or independently copy this runtime.
3. Integrate read-only shadow guidance through the existing orchestrator boundary
   in the central development loop and Naruon. Compare no graph, fixed graph, and
   evolved graph under matched conditions. Measure task success, sequence errors,
   duplicate effects, tokens/cost, and latency separately; do not invent gains.
4. Add sanitized trajectory extraction, offline candidate generation, authenticated
   receipt verification, persistent rejection memory, CAS promotion and recovery.
5. Enable opt-in canaries for other products only after their own conformance and
   rollback evidence. Accounting postings, billing, employment assessment, data
   deletion and deployment retain their independent high-risk approval controls.

Do not force this pattern into deterministic numerical kernels or create another
central scheduler. Source adoption, shadow use, canary, active deployment, and
rollback-tested operation must appear as separate states in the adoption matrix.
The active documentation lane may reconcile the ADR index and PRD/TRD/traceability
without this lane overwriting its root baseline or historical evidence.

## Acceptance and remaining limitations

The focused tests exercise the pure boundary; native repository typecheck,
repository-wide exact coverage, inherited security checks, independent review,
release artifacts, and deployed operational evidence remain distinct requirements.
See the [implementation plan and verification record](../superpowers/plans/2026-09-10-procedural-graphs.md).
No automatic LLM refiner, signed graph store, guidance prompt, MCP endpoint,
production caller integration, or organization-wide deployment is delivered by
this first source slice.
