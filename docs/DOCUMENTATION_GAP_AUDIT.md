# Noema Documentation Gap Audit

- **Audit date:** 2026-08-10
- **Audit scope:** Noema product, runtime, reviewer/evidence plane, autonomous maintenance, release/deployment, licensing/IP, acquisition readiness, protected-main operational guidance, and current active PR/issue ownership.
- **Protected `main` observed for this audit:** `c85d710804139c0697d7ef8fa47d02b1389e6d84`.
- **Owning PR:** #71
- **Audit state:** In review; this file is not protected-main evidence until #71 merges.

## Baseline verdict

### Design sufficiency

**DESIGN_SUFFICIENT: PASS / In review.** The canonical graph is broad enough to reconstruct Noema's product requirements, technical invariants, authority boundaries, runtime and automation topology, persistence truth, evidence semantics, security model, testing, operability, release/provenance, licensing/IP-transfer contract, and requirement-to-evidence traceability without chat or PR-body archaeology.

The required families already exist: PRD, TRD, root Architecture, status-bearing ADRs, UML, conceptual/logical ERD, API contracts, runtime and automation threat models, test strategy, operability/recovery, release/provenance, licensing/IP transfer, traceability, AGENTS/CLAUDE/README/CHANGELOG integration. Adding more documents merely to increase the count would create parallel authority rather than close a product gap.

### Protected-main / operational sufficiency

**PROTECTED_MAIN_OPERATIONALLY_SUFFICIENT: FAIL CLOSED / incomplete.** Design completeness is not operational acceptance. PR #71 is still unmerged, several decisions remain active-PR proposals, and repository text cannot fabricate live rulesets, qualifying independent approval, Reviewer/Maintainer App provisioning, private-vulnerability-reporting settings, protected production controls, release/deployment receipts, KPI provenance, customer/revenue evidence, or legal ownership/transfer evidence.

Protected `main` now includes PR #76's bounded `nanoid@3.3.17` remediation at `c85d710804139c0697d7ef8fa47d02b1389e6d84`. The old repository-wide inherited nanoid blocker is therefore no longer a current protected-base prerequisite. Stale feature branches must still be rebuilt onto the current lineage and reacquire exact-head evidence; predecessor results never transfer.

## Documentation family scorecard

| Family | Canonical source | Assessment | Residual owner / rule |
| --- | --- | --- | --- |
| Product requirements | `docs/PRD.md` | Adequate, In review | Keep Implemented/Planned/External evidence aligned with protected truth and current successors. |
| Technical requirements | `docs/TRD.md` | Adequate, In review | Exact-head/live-base/evidence/write/scheduler/release contracts are sufficient; active ownership must stay current. |
| Architecture | `ARCHITECTURE.md` | Strong, In review | Root architecture correctly identifies itself as proposed while #71 is unmerged. |
| ADR lifecycle | `docs/adr/README.md`, ADR-0001..0011 | Sufficient baseline | Proposed ADRs become Accepted/Superseded only with protected evidence. |
| UML | `docs/UML.md` | Adequate | Component, sequence, state, authority and deployment views exist. |
| ERD / evidence model | `docs/ERD.md` | Adequate for current persistence truth | Separates Durable Object persistence from conceptual GitHub/evidence entities. |
| API and schema contracts | `docs/api-spec.md`; PR #99 `openapi.json` | Strong design, machine contract Proposed/In review | PR #99 adds OpenAPI 3.1 plus an executable structural contract for actual integrator/buyer consumption. It is not protected-main truth until protected merge. |
| Runtime threat model | `docs/threat-model.md` | Strong | Protected-main replay ordering remains explicit until #81/#83 integrates. |
| Automation threat model | `docs/automation-threat-model.md` | Adequate, In review | Keep model/verifier/publisher/writer-race and credential-crossing threats current. |
| SECURITY / disclosure | PR #95 + issue #73 | Partial | #95 is the clean current policy/read-only-audit successor; #72 is historical. Live setting/reporter/staffing/exercise evidence remains external. |
| Test strategy | `docs/TEST_STRATEGY.md` | Adequate, In review | #82/#86 and #84 own public-API and coverage-truthfulness gaps; PR #99 separately owns machine-readable HTTP interoperability. |
| Operability | `docs/OPERABILITY.md` + runbooks | Strong baseline | #27/#29/#30 and protected operational evidence remain external/active; issue #96/PR #97 separately cover retained external scheduler evidence. |
| Release/provenance | release/acquisition docs and scripts | Substantial design; operationally incomplete | Require exact integrated release/publication/deployment receipts. |
| Licensing/IP | `docs/LICENSING_AND_IP_TRANSFER.md` | Strong authority contract; legal evidence incomplete | #5 owns legal authority; #69 owns technical consistency and exact-release rights evidence. |
| Traceability | `docs/TRACEABILITY.md` | Adequate, In review | Follow current successor PRs, not historical owners. |
| CHANGELOG | `CHANGELOG.md` | Present | History, not architecture authority. |
| AGENTS / CLAUDE | `AGENTS.md`, `CLAUDE.md` | Partial — protected-main `AGENTS.md` stale | PR #90 is the clean current successor for protected-base Security Scan semantics. |

## PRD adequacy

The PRD is sufficient for the current product boundary. It identifies maintainers, security/platform operators, CWL consumers, independent reviewers, buyers and coding agents; separates credential exchange, review composition, maintenance, product-development proposal and acquisition-evidence modes; defines FR-001..FR-019; and explicitly treats prompt, documentation, RCA, test, commit, PR and merge as intermediate artifacts.

The remaining PRD gaps are evidence gaps rather than missing prose: production SLO/KPI provenance, customer discovery and willingness-to-pay, support ownership, immutable release/deployment evidence and buyer transfer rights remain external until observed.

## TRD adequacy

The TRD is sufficient for the current technical design. It separates exact contributor head, PR-base snapshot, independently resolved live base, stack predecessor and synthetic integration; binds immutable workflow source; keeps runner assignment separate from workflow conclusions; requires complete pagination, stale refusal and writer lease; defines RCA/feasibility/defer semantics; records OpenCode/`NVIDIA_NIM_API_KEY` credential boundaries; and defines package, release, provenance and operational-acceptance semantics.

Current successor ownership is:

- PR #90 for repository-owned governance detection and corrected central Security Scan guidance;
- PR #91 for exact Node/npm, install-script and lockfile change control;
- PR #92 for private-target reviewer authentication;
- PR #93 for the clean protected-main exact patch-quarantine successor;
- PR #94 for runner assignment evidence after historical PR #88 was superseded;
- PR #95 for coordinated vulnerability-disclosure policy and bounded private-reporting setting audit after historical PR #72 was superseded;
- PR #97 for fail-closed repository validation of retained external scheduler continuation/error-recovery evidence under issue #96;
- PR #99 for the machine-readable OpenAPI 3.1 HTTP interoperability contract and executable contract test; it remains Proposed/In review until protected merge;
- PR #80 for atomic publisher and work-conserving scheduler implementation;
- PR #83 for replay-before-token-mint;
- PR #86 for deterministic public API documentation;
- PR #69 for acquisition manifest integrity.

## ADR adequacy

The eleven-ADR baseline is sufficient for the durable decisions represented in this conversation and current repository state:

1. evidence authority separation;
2. work-conserving autonomy and deliverable handoff;
3. exact revision plus independently resolved live base;
4. safe conditional repository writes and no repair-workflow privilege escalation;
5. fail-closed untrusted materialization;
6. protected-main operational acceptance distinct from PR verification;
7. deterministic package-manager/lockfile evidence;
8. atomic proposal publication;
9. central-vs-local automation ownership;
10. private-target reviewer authentication with a repository-scoped Noema App capability;
11. independent reviewer governance and qualifying formal `APPROVED` evidence.

The scheduler's generic task error and the requirement to continue after prompt repair do not introduce a new durable authority choice. They are already governed by ADR-0002, ADR-0003, ADR-0004, ADR-0006 and ADR-0009. Issue #96 and PR #97 add bounded executable evidence validation, not a new architecture authority. PR #99 makes the existing public HTTP boundary machine-readable for interoperability; it does not change authority, persistence, security topology or runtime behavior, so a new ADR would be artificial. A new ADR is required only for a genuinely new durable decision such as validator-image publication/activation, a real persistent evidence store, a stable release/support channel, or materially changed production topology.

## Architecture and UML adequacy

`ARCHITECTURE.md` and `docs/UML.md` cover runtime/MSA ownership, credential exchange, PR maintenance, product development, RCA/action continuation, reviewer/merge authority, evidence-to-release state and deployment topology. Additional diagrams are not required merely to increase count.

Protected `main` still has the pre-#83 replay ordering. The canonical docs therefore retain the limitation that the **current ordering can detect a replay after GitHub installation-token creation**. **Issue #81** remains the acceptance owner. PR #83 proposes the repair **after cryptographic OIDC and target authorization but before** `createInstallationToken()`. It is not protected behavior until dependency-ordered integration and operational proof.

## ERD adequacy

A physical relational ERD would be misleading today. The canonical model explicitly separates persisted runtime state—distributed rate-limit state and OIDC replay state—from conceptual/external evidence entities such as `repository_target`, `pull_request_snapshot`, `source_revision`, `base_revision`, `workflow_run`, `runner_assignment_evidence`, `check_evidence`, `status_evidence`, `review_evidence`, `scanner_evidence`, `model_judgement`, `writer_lease`, `publication_proposal`, `operational_acceptance`, `release_evidence`, and `acquisition_evidence`.

`runner_assignment_evidence` never turns runner allocation/start into source correctness or terminal check success. Historical PR #88 introduced the workstream; current Draft **PR #94** is the clean implementation owner on the deterministic toolchain stack. External scheduler evidence validated by PR #97 remains conceptual/retained operational evidence rather than a new relational persistence claim. If Noema later owns a durable evidence database, add a physical schema/migration ERD then; do not pretend conceptual entities are tables today.

## Licensing / IP adequacy

The documentation correctly separates public source visibility from granted rights and technical evidence from owner/legal authority. Exact release artifacts require authenticated rights evidence rather than self-asserted metadata. The canonical contract expects digest-bound `artifact_rights_metadata` when an artifact exposes rights metadata. PR #69 demonstrates why duplicate decoded JSON keys and malformed UTF-8 must fail closed before a rights or revenue value becomes acquisition evidence. These are technical controls, not legal clearance.

## Security documentation adequacy

Runtime and automation threat models remain intentionally separate. **PR #95** is the clean current successor for coordinated vulnerability-disclosure policy and the bounded read-only setting audit; historical PR #72 is superseded. Issue #73 owns administrator setting, reporter UI, notification/staffing evidence and a benign exercise. PR #92 is the clean current successor for private-target reviewer authentication; historical PR #85 is superseded.

Protected-main `AGENTS.md` is **stale** relative to current central Security Scan semantics. PR #90 is the clean current successor to historical PR #87. It documents protected-base event eligibility, treats **feature-base** absence as non-passing `defer_until_trigger`, and records the **MEDIUM/HIGH/CRITICAL** vulnerability threshold. Until PR #90 or an equivalent correction reaches protected main, automation must prefer live central evidence over stale agent prose.

## Standards / doctoring adequacy

Current doctoring is sufficient for the present architecture. Add or update primary-source citations only when they materially support a product or technical decision. Prefer final normative standards, identify drafts as drafts, and keep mutable verification dates in focused doctoring rather than timeless architecture.

## Protected-main acceptance

The documentation set is not Accepted merely because files exist on #71. Protected-main acceptance requires:

1. current exact-head documentation/application checks appropriate to the evidence class;
2. current findings resolved or explicitly classified stale/incorrect;
3. current successor ownership recorded without stale PR-body archaeology;
4. stale protected-main operational guidance corrected through PR #90 or an equivalent protected line;
5. actual applicable governance and qualifying independent review;
6. protected merge of #71;
7. post-merge confirmation that the canonical graph is discoverable on protected `main`;
8. protected-main operational proof before Proposed privileged/control behavior becomes Accepted/Implemented.

PR #76 is already integrated; it is no longer an unfinished acceptance prerequisite.

## Remaining gaps

### G-01 Enforceable main governance
Issue #27 remains the live control owner. **PR #90** strengthens repository-owned detection and corrects stale Noema guidance but cannot create the live ruleset, direct-push rejection or break-glass evidence. Historical PR #87 is superseded. ADR-0011 remains Proposed until governance and reviewer eligibility are real.

### G-02 Reviewer/Maintainer App provisioning
Issue #29 remains external operational work. PR #92 repairs the source-side private-target auth boundary, but known ineligible username routes remain non-authoritative until actual App provisioning and eligibility change.

### G-03 Protected dependency baseline
PR #76 is **integrated** on protected `main` and establishes `nanoid@3.3.17`. Future branches must start from or honestly converge onto that lineage; predecessor evidence is not copied.

### G-04 Package-manager reproducibility
**PR #91** owns the current exact Node/npm/lockfile/install-script control. Historical PR #89 and PR #78 are superseded and closed. Merge still requires live governance and qualifying approval, followed by protected-main operational rehearsal.

### G-05 Atomic publisher / autonomous continuation / NIM credential compartment
PR #80 owns the proposed publisher and work-conserving scheduler/security boundary. A scheduler prompt update or generic scheduled-task error is not repository implementation proof and earns no completion credit. One blocked task lane must rotate to another safe repository action.

### G-06 Coordinated vulnerability disclosure
**PR #95** is the clean current policy/read-only-audit successor to historical PR #72. Issue #73 owns operational setting, reporter UI, notification/staffing and benign exercise evidence. Source/check success does not prove those live controls.

### G-07 Release/deployment evidence
Require immutable release publication, exact SBOM/provenance, protected environment governance, deployment identity, production smoke/KPI provenance and rollback/recovery evidence before release claims.

### G-08 Commercial/acquisition evidence
Customer/pilot, revenue/LOI/pipeline, support/cloud/credential ownership and transfer evidence remain external and cannot be fabricated by documentation.

### G-09 Replay claim before privileged token mint
Issue #81 remains open. Protected `main` can still detect replay only after the privileged GitHub installation-token creation side effect. PR #83 contains the active repair after verified/authorized OIDC and target authorization but **before `createInstallationToken()`**; it is not protected truth until integration and operational proof.

### G-10 Private-target reviewer authentication
**PR #92** is the clean current protected-main successor to historical PR #85. Acceptance still requires a real private ContextualWisdomLab target with Noema App installation and exact-head evidence collection without permission broadening.

### G-11 TypeScript public API documentation gate
Issue #82 / PR #86 remain active. Deterministic public-export inventory and beginner-readable JSDoc must be refreshed onto the resulting protected lineage after the replay/security ownership converges.

### G-12 Coverage truthfulness
Issue #84 remains open. Broad V8 exclusions around security-critical code must not make configured 100% coverage look like exercised behavior.

### G-13 Licensing/IP transfer and exact-release rights evidence
Issue #5 owns owner/legal rights and contributor/assignment evidence. PR #69 owns technical consistency including `artifact_rights_metadata`, exact artifact/revision identity, duplicate-key rejection and fatal UTF-8 handling.

### G-14 Runner assignment observability and historical Actions RCA
Issue #30 owns intermittent Actions reliability. Historical PR #88 is superseded; **PR #94** is the current read-only runner assignment audit owner on top of PR #91. Current jobs receiving runners disproves a current repository-wide disablement explanation but does not prove a historical organization billing, runner-group or enterprise-policy cause.

### G-15 Protected-main agent guidance drift
Protected-main `AGENTS.md` is stale on central Security Scan event selection and vulnerability threshold. **PR #90** owns the current correction: protected-base eligibility, feature-base absence as non-passing `defer_until_trigger`, and MEDIUM/HIGH/CRITICAL. This blocks any claim that protected-main agent guidance itself is current.

### G-16 Exact patch quarantine and validator image convergence
**PR #93** is the clean current exact patch-quarantine successor on protected main. Historical PR #65 is superseded. The validator image line in PR #67 must be rebuilt onto the protected successor lineage; issue #66 separately owns publication, signing, attestation and activation.

### G-17 Scheduler/control-plane execution evidence
The repository already specifies no-early-stop and deliverable handoff through FR-018/FR-019 and ADR-0002. **Issue #96 / Draft PR #97** are the current repository-owned evidence-validation line for retained external scheduler records. PR #97 can validate exact repository/head/prompt identity, bounded timestamps, generic-error recovery, material GitHub actions, credential-free evidence and exit-sweep/budget fields, but it cannot enable or operate the external task. Actual scheduler activation, recurrence and execution remain external evidence.

### G-18 Machine-readable HTTP interoperability
Protected `main` has prose HTTP documentation but no versioned machine-readable contract. **PR #99** is the current bounded owner: OpenAPI 3.1 for `/health`, `/ready`, and `/exchange`, GitHub Actions OIDC Bearer semantics, the 8,192-byte request limit, protocol headers and an executable contract test. Its exact-head application CI, reviewer-ci and central Security Scan reached terminal success before the Ready transition, but CodeRabbit skipped the Draft revision and no qualifying independent formal approval is claimed. Therefore PR #99 remains **Proposed/In review**, not protected truth or merge authority.

## 10. Documentation-to-execution handoff

A prose verdict is not sufficient remediation. When this audit identifies a stale or contradictory artifact, **documentation assessment must mutate GitHub state** through the canonical #71 line and an executable contract rather than creating parallel authority.

Likewise, **documentation repair is intermediate**. Once a documentation mutation is reviewable or waiting on checks, return to the highest-value safe non-documentation lane: source defect, security hardening, review remediation, stack repair, operational proof or buyer-visible work.

The handoff contract is:

```text
prompt update → repository-consumed policy and executable contract
RCA → feasible action
design → implementation
test → production code
documentation assessment → canonical repository files
local changes → intentional commit → pull request
pull request → exact-head checks → review remediation → protected merge
protected merge → protected-main operational acceptance → queue top
double exit sweep
```

A user-visible report is not completion while a fresh queue contains an executable action.

## 11. Future audit rule

Re-run this audit after material architecture, authority, persistence, release or product-boundary change. A run-level documentation verdict is acceptable only when every canonical family exists or has an explicit N/A rationale; implementation status is not overstated; active owners are current; traceability maps material requirements to source/tests/evidence; protected-main guidance contradictions are explicitly classified; documentation assessment mutates canonical GitHub state when deficient; documentation completion does not terminate the run while safe non-documentation work remains; and the double exit sweep finds no further safe handoff.