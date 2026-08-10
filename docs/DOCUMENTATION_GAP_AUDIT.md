# Noema Documentation Gap Audit

- **Audit date:** 2026-08-10
- **Audit scope:** Noema product, runtime, reviewer/evidence plane, autonomous maintenance, release/deployment, licensing/IP, acquisition readiness, protected-main operational guidance, and current active PR/issue ownership.
- **Owning PR:** #71
- **Audit state:** In review; this file is not protected-main evidence until #71 merges.

## Baseline verdict

### Design sufficiency

**PASS / In review.** The canonical graph is broad enough to reconstruct Noema's product requirements, technical invariants, authority boundaries, runtime and automation topology, data/evidence semantics, security model, testing, operability, release/provenance, licensing/IP-transfer contract, and requirement-to-evidence traceability without chat or PR-body archaeology.

This is a design-sufficiency verdict only. One protected-main operational document is currently stale relative to the live central control plane: protected-main `AGENTS.md` still says Security Scan runs on every PR base including stacked PRs and summarizes the Trivy hard gate as CRITICAL/HIGH. PR #87 owns the Noema-side correction to protected-base event eligibility, feature-base absence as non-passing `defer_until_trigger`, and the current MEDIUM/HIGH/CRITICAL threshold. Until that correction reaches protected main, agent guidance is partial/stale and must not be treated as current central-scan authority.

### Protected-main / operational sufficiency

**FAIL CLOSED / incomplete.** Design completeness is not operational acceptance. PR #71 is not integrated, several implementation decisions remain active-PR proposals, protected-main `AGENTS.md` is stale on central Security Scan semantics, and source code cannot fabricate live rulesets, reviewer/App provisioning, private-vulnerability-reporting settings, protected production controls, release/deployment receipts, KPI provenance, customer/revenue evidence, or legal ownership/transfer evidence.

The documentation family is therefore **DESIGN_SUFFICIENT** for review but not **PROTECTED_MAIN_OPERATIONALLY_SUFFICIENT**.

## Documentation family scorecard

| Family | Canonical source | Assessment | Residual owner / rule |
| --- | --- | --- | --- |
| Product requirements | `docs/PRD.md` | Adequate, In review | Keep users, modes, FR/NFR, degraded behavior, acceptance and non-goals aligned with protected behavior. |
| Technical requirements | `docs/TRD.md` | Adequate, In review | Active implementation remains Proposed until protected integration and exact evidence. |
| Architecture | `ARCHITECTURE.md` | Strong, In review | Root architecture identifies itself as proposed while #71 is unmerged. |
| ADR lifecycle | `docs/adr/README.md`, ADR-0001..0011 | Baseline adequate | Proposed ADRs become Accepted/Superseded only with protected evidence. |
| UML | `docs/UML.md` | Adequate | Component, sequence, state, authority and deployment views exist. |
| ERD / evidence model | `docs/ERD.md` | Adequate for current persistence truth | Separates Durable Object persistence from conceptual GitHub/evidence entities. |
| API contract | `docs/api-spec.md` | Strong | Do not create machine-schema theatre without an actual consumer need. |
| Runtime threat model | `docs/threat-model.md` | Strong | Replay ordering stays documented as current protected behavior until #83 integrates. |
| Automation threat model | `docs/automation-threat-model.md` | Adequate, In review | Keep model/verifier/publisher/writer-race threats current. |
| SECURITY / disclosure | PR #72 + issue #73 | Partial | Policy and live repository setting/exercise are separate evidence. |
| Test strategy | `docs/TEST_STRATEGY.md` | Adequate, In review | #82/#86 and #84 own public-API and coverage-truthfulness gaps. |
| Operability | `docs/OPERABILITY.md` + runbooks | Strong baseline | #27/#29/#30 and protected operational evidence remain external/active. |
| Release/provenance | release/acquisition docs and scripts | Substantial design; operationally incomplete | Require exact integrated release/publication/deployment receipts. |
| Licensing/IP | `docs/LICENSING_AND_IP_TRANSFER.md` | Strong authority contract; legal evidence incomplete | #5 owns legal authority; #69 owns technical consistency and exact-release rights evidence. |
| Traceability | `docs/TRACEABILITY.md` | Adequate, In review | Follow current successor PRs, not closed historical owners. |
| CHANGELOG | `CHANGELOG.md` | Present | History, not architecture authority. |
| AGENTS / CLAUDE | `AGENTS.md`, `CLAUDE.md` | **Partial — protected-main `AGENTS.md` stale** | PR #87 corrects protected-base event eligibility, feature-base non-passing semantics, and MEDIUM/HIGH/CRITICAL scanner threshold. |

## PRD adequacy

The PRD covers current product identity and material buyer/operator requirements, including standalone plus CWL MSA operation, exact-evidence authority, review/maintenance/product-development modes, degraded behavior, acquisition evidence, and work-conserving deliverable handoff. Residual gaps are measured commercial evidence rather than missing prose: customer discovery, pricing/willingness-to-pay, production SLO evidence and support ownership remain external until observed.

## TRD adequacy

The TRD separates exact contributor head, PR-base snapshot, independently resolved live base, stack predecessor and synthetic integration; binds immutable workflow source; separates check/status/review/scanner/model/merge/release/deployment evidence; keeps runner assignment separate from workflow conclusions; requires pagination, stale refusal and writer lease; defines RCA/feasibility/defer semantics; records OpenCode/NVIDIA NIM credential boundaries; and defines package/release/provenance semantics.

Residual implementation/acceptance work includes #89 after superseded #78, #80 scheduler/publisher/NIM compartment, #81/#83 replay ordering, #85 private-target review authentication, #88 runner-assignment evidence, and live #27/#29 governance/reviewer eligibility.

## ADR adequacy

The **eleven ADR baseline** is sufficient for the current durable decision set:

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
11. **ADR-0011 independent reviewer governance** and qualifying formal `APPROVED` evidence.

A new ADR is required only when a new durable authority choice appears, such as patch-validator publication/activation, a real persistent evidence store, a stable release/support channel, or a materially changed production topology. Runner-assignment observability and stale-agent-guidance correction apply existing evidence/ownership decisions rather than creating a new authority.

## Architecture and UML adequacy

`ARCHITECTURE.md` and `docs/UML.md` cover runtime/MSA ownership, credential exchange, PR maintenance, product development, RCA/action continuation, reviewer/merge authority, evidence-to-release state, and deployment topology. Additional diagrams are not required merely to increase count.

Protected `main` still has the pre-#83 replay ordering. The canonical docs therefore retain the limitation that the **current ordering can detect a replay after GitHub installation-token creation**. Issue #81 remains the acceptance owner. PR #83 proposes the repair **after cryptographic OIDC and target authorization but before** `createInstallationToken()`. It is not protected behavior until dependency-ordered integration and operational proof.

## ERD adequacy

A physical relational ERD would be misleading today. The canonical model explicitly separates persisted runtime state—distributed rate-limit state and OIDC replay state—from conceptual/external evidence entities such as `repository_target`, `pull_request_snapshot`, `source_revision`, `base_revision`, `workflow_run`, `runner_assignment_evidence`, `check_evidence`, `status_evidence`, `review_evidence`, `scanner_evidence`, `model_judgement`, `writer_lease`, `publication_proposal`, `operational_acceptance`, `release_evidence`, and `acquisition_evidence`.

`runner_assignment_evidence` never turns runner allocation/start into source correctness or terminal check success. If Noema later owns a durable evidence database, add physical schema/migration ERD then; do not pretend conceptual entities are tables today.

## Licensing / IP adequacy

The documentation correctly separates public source visibility from granted rights and technical evidence from owner/legal authority. Exact release artifacts require authenticated rights evidence rather than self-asserted metadata. The canonical contract expects digest-bound `artifact_rights_metadata` when an artifact exposes rights metadata. PR #69 also demonstrates why duplicate decoded JSON keys and malformed UTF-8 must fail closed before a rights or revenue value becomes acquisition evidence. These are technical controls, not legal clearance.

## Security documentation adequacy

Runtime and automation threat models remain intentionally separate. PR #72 owns coordinated disclosure policy/read-only setting audit; issue #73 owns administrator setting, notification/staffing evidence and a benign exercise. PR #85 owns private-target reviewer authentication.

Protected-main `AGENTS.md` is **stale** relative to the live central Security Scan contract. It currently teaches that Security Scan runs on every PR base, including stacked PRs, and describes a CRITICAL/HIGH-only Trivy gate. PR #87 contains the bounded Noema-owned correction: central scans are protected-base event eligible; a feature-base stack can have no central scan and that absence remains non-passing `defer_until_trigger`; the fail-closed vulnerability threshold is MEDIUM/HIGH/CRITICAL. Until #87 or an equivalent protected-main correction integrates, automation must prefer live central evidence over stale agent prose.

## Standards / doctoring adequacy

Current doctoring is sufficient for the present architecture. Add/update primary-source citations when they materially support a product or technical decision. Prefer final normative standards, identify drafts as drafts, and keep mutable verification dates in focused doctoring rather than high-level architecture.

## Protected-main acceptance

The documentation set is not Accepted merely because files exist on #71. Protected-main acceptance requires:

1. current exact-head documentation/application checks appropriate to the evidence class;
2. inherited dependency-security failure removed by #76 rather than waived;
3. current findings resolved or explicitly classified stale/incorrect;
4. stale protected-main operational guidance corrected, including the #87 Security Scan semantics;
5. actual applicable governance and qualifying independent review;
6. protected merge of #71;
7. post-merge confirmation that the canonical graph is discoverable on protected `main`;
8. protected-main operational proof before Proposed privileged/control behavior becomes Accepted/Implemented.

## Remaining gaps

### G-01 Enforceable main governance
Issue #27 remains the live control owner; PR #87 strengthens repository-owned detection and corrects stale Noema guidance but cannot create the live ruleset or direct-push/break-glass evidence. **ADR-0011 independent reviewer governance** remains Proposed until governance and reviewer eligibility are real.

### G-02 Reviewer/Maintainer App provisioning
Issue #29 remains external operational work. Previously disproven non-collaborator routes are not approval and should not be spammed until eligibility changes.

### G-03 Dependency remediation / integration
PR #76 is the minimal `nanoid` remediation. Direct-main dependent PRs remain blocked by protected-main audit until it integrates; do not lower or waive the audit.

### G-04 Package-manager reproducibility
PR #89 owns the current Node/npm/lockfile/install-script control after #78 was **superseded and closed**. It remains dependency-ordered behind #76.

### G-05 Atomic publisher / autonomous continuation / NIM credential compartment
PR #80 owns the proposed publisher and work-conserving scheduler/security boundary. Scheduler prompt behavior is not protected-main implementation evidence.

### G-06 Coordinated vulnerability disclosure
PR #72 provides policy/read-only setting audit; issue #73 owns operational setting/notification/exercise evidence.

### G-07 Release/deployment evidence
Require immutable release publication, exact SBOM/provenance, protected environment governance, deployment identity, production smoke/KPI provenance and rollback/recovery evidence before release claims.

### G-08 Commercial/acquisition evidence
Customer/pilot, revenue/LOI/pipeline, support/cloud/credential ownership and transfer evidence remain external and cannot be fabricated by documentation.

### G-09 Replay claim before privileged token mint
Issue #81 remains open. Protected `main` can still detect replay only after the privileged GitHub installation-token creation side effect. PR #83 contains the active repair after verified/authorized OIDC and target authorization but **before `createInstallationToken()`**; it is not protected truth until integration and operational proof.

### G-10 Private-target reviewer authentication
PR #85 remains active. Acceptance requires a real private ContextualWisdomLab target with Noema App installation and exact-head evidence collection without permission broadening.

### G-11 TypeScript public API documentation gate
Issue #82 / PR #86 remain active. Deterministic public-export inventory and beginner-readable JSDoc must reach the protected lineage.

### G-12 Coverage truthfulness
Issue #84 remains open. Broad V8 exclusions around security-critical code must not make configured 100% coverage look like exercised behavior.

### G-13 Licensing/IP transfer and exact-release rights evidence
Issue #5 owns owner/legal rights and contributor/assignment evidence. PR #69 owns technical consistency including `artifact_rights_metadata`, exact artifact/revision identity, duplicate-key rejection and fatal UTF-8 handling.

### G-14 Runner assignment observability and historical Actions RCA
Issue #30 owns intermittent Actions reliability. PR #88 adds read-only runner assignment evidence; current jobs receiving runners disproves a current repository-wide disablement explanation but does not prove historical organization billing/runner-group/enterprise-policy cause.

### G-15 Protected-main agent guidance drift
Protected-main `AGENTS.md` is stale on central Security Scan event selection and vulnerability threshold. PR #87 owns the current correction: protected-base eligibility, **feature-base** absence as non-passing `defer_until_trigger`, and **MEDIUM/HIGH/CRITICAL**. This gap blocks any claim that protected-main agent guidance itself is current even while the proposed #71 canonical design graph remains reviewable.

## 10. Documentation-to-execution handoff

A prose verdict is not sufficient remediation. When this audit identifies a stale or contradictory artifact, **documentation assessment must mutate GitHub state** through the canonical #71 line and an executable contract rather than creating parallel authority.

Likewise, **documentation repair is intermediate**. Once a documentation mutation is reviewable or waiting on checks, return to the highest-value safe non-documentation lane: source defect, security hardening, review remediation, stack repair, operational proof or buyer-visible work.

The handoff contract is:

```text
prompt update → repository-consumed policy and test
RCA → feasible action
design → implementation
test → production code
documentation assessment → canonical repository files
local changes → intentional commit → pull request
pull request → exact-head checks → review remediation → protected merge
protected merge → protected-main operational acceptance → queue top
```

A user-visible report is not completion while a fresh queue contains an executable action.

## 11. Future audit rule

Re-run this audit after material architecture, authority, persistence, release or product-boundary change. A run-level documentation verdict is acceptable only when every canonical family exists or has an explicit N/A rationale; implementation status is not overstated; active owners are current; traceability maps material requirements to source/tests/evidence; protected-main guidance contradictions are explicitly classified; documentation assessment mutates canonical GitHub state when deficient; documentation completion does not terminate the run while safe non-documentation work remains; and the double exit sweep finds no further safe handoff.
