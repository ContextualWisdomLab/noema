# Noema Documentation Gap Audit

- **Audit date:** 2026-08-10
- **Audit scope:** Noema product, runtime, reviewer/evidence plane, autonomous maintenance, release/deployment, licensing/IP and acquisition-readiness decisions represented by protected `main`, current active PRs/issues and durable project decisions.
- **Owning PR:** #71
- **Audit state:** In review; this file is not protected-main evidence until #71 merges.

## Baseline verdict

### Design sufficiency

**PASS / In review.** The canonical graph is now broad enough to reconstruct Noema's product requirements, technical invariants, authority boundaries, runtime and automation topology, data/evidence semantics, security model, testing, operability, release/provenance, licensing/IP-transfer contract and requirement-to-evidence traceability without relying on chat or PR-body archaeology.

### Protected-main / operational sufficiency

**FAIL CLOSED / incomplete.** Design completeness is not operational acceptance. PR #71 is not integrated, several implementation decisions remain active-PR proposals, and source code cannot fabricate live rulesets, reviewer/App provisioning, private-vulnerability-reporting settings, protected production controls, release/deployment receipts, KPI provenance, customer/revenue evidence, or legal ownership/transfer evidence.

The documentation family is therefore **DESIGN_SUFFICIENT** but not **PROTECTED_MAIN_OPERATIONALLY_SUFFICIENT**.

## Documentation family scorecard

| Family | Canonical source | Assessment | Residual owner / rule |
| --- | --- | --- | --- |
| Product requirements | `docs/PRD.md` | Adequate, In review | Keep users, modes, FR/NFR, degraded behavior, acceptance and non-goals aligned with protected behavior. |
| Technical requirements | `docs/TRD.md` | Adequate, In review | Active implementation remains Proposed until protected integration and exact evidence. |
| Architecture | `ARCHITECTURE.md` | Strong, In review | Root architecture explicitly identifies itself as proposed while #71 is unmerged. |
| ADR lifecycle | `docs/adr/README.md`, ADR-0001..0011 | Baseline adequate | Proposed ADRs become Accepted/Superseded only with protected evidence. |
| UML | `docs/UML.md` | Adequate | Component, sequence, state, authority and deployment views exist; update only when real boundaries change. |
| ERD / evidence model | `docs/ERD.md` | Adequate for current persistence truth | Separates Durable Object persistence from conceptual GitHub/evidence entities. |
| API contract | `docs/api-spec.md` | Strong | Do not create machine-schema theatre without an actual consumer need. |
| Runtime threat model | `docs/threat-model.md` | Strong | Replay ordering stays documented as current protected behavior until #83 integrates. |
| Automation threat model | `docs/automation-threat-model.md` | Adequate, In review | Keep model/verifier/publisher/writer-race and authority-collapse threats current. |
| SECURITY / disclosure | PR #72 + issue #73 | Partial | Policy and live repository setting/exercise are separate evidence. |
| Test strategy | `docs/TEST_STRATEGY.md` | Adequate, In review | #82/#86 and #84 still own public-API and coverage-truthfulness gaps. |
| Operability | `docs/OPERABILITY.md` + runbooks | Strong baseline | #27/#29/#30 and protected operational evidence remain external/active. |
| Release/provenance | release/acquisition docs and scripts | Substantial design; operationally incomplete | Require exact integrated release/publication/deployment receipts. |
| Licensing/IP | `docs/LICENSING_AND_IP_TRANSFER.md` | Strong authority contract; legal evidence incomplete | #5 owns legal authority; #69 owns technical consistency and exact-release rights evidence. |
| Traceability | `docs/TRACEABILITY.md` | Adequate, In review | Must follow current successor PRs, not closed historical owners. |
| CHANGELOG | `CHANGELOG.md` | Present | Changelog is history, not architecture authority. |
| AGENTS / CLAUDE | `AGENTS.md`, `CLAUDE.md` | Present | Keep operational rules thin and aligned with canonical docs. |

## PRD adequacy

The PRD covers the current product identity and material buyer/operator requirements, including standalone plus CWL MSA operation, exact-evidence authority, review/maintenance/product-development modes, degraded behavior, acquisition evidence, and the work-conserving deliverable-handoff contract.

Residual PRD gaps are commercial evidence rather than missing prose: real customer discovery, pricing/willingness-to-pay, production SLO evidence and support ownership remain external until measured.

## TRD adequacy

The TRD covers:

- exact contributor head, PR-base snapshot, independently resolved live base, stack predecessor and synthetic integration as different identities;
- immutable workflow source binding;
- check/status/review/scanner/model/merge/release/deployment evidence separation;
- **runner assignment** evidence separated from workflow/check conclusions;
- full pagination, stale refusal and writer lease;
- RCA/feasibility/defer semantics;
- OpenCode + NVIDIA NIM credential boundary;
- deterministic package-manager/lockfile direction;
- release/provenance and conceptual-vs-persisted evidence semantics.

Residual TRD gaps are implementation/acceptance work:

- PR #89 is now the dependency-ordered package-manager reproducibility implementation after closed #78 was **superseded**; #89 must follow #76 and later receive protected-base Security Scan evidence;
- #80 remains the proposed atomic publisher/work-conserving scheduler/NIM-compartment implementation;
- exact required-check/reviewer policy remains dependent on live #27 governance and #29 reviewer eligibility;
- Issue #81 remains the protected-main replay side-effect gap until #83 integrates;
- #85 private-target reviewer authentication still requires protected integration and a real private-target exercise;
- #88 provides repository-owned read-only runner assignment observation, while historical organization-level Actions cause remains external unless live administrative evidence proves it.

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
11. independent reviewer governance and qualifying formal `APPROVED` evidence.

A new ADR is needed only when a new durable authority choice appears, for example patch-validator image publication/activation, a real persistent evidence store, a stable release/support channel, or a materially changed production topology. Runner-assignment observability alone remains an application of ADR-0001/0006 rather than a new authority choice.

## Architecture and UML adequacy

`ARCHITECTURE.md` and `docs/UML.md` cover runtime/MSA ownership, credential exchange, PR maintenance, product development, RCA/action continuation, reviewer/merge authority, evidence-to-release state and deployment topology. Additional diagrams are not required merely to increase count.

Protected `main` still has the pre-#83 replay ordering. The canonical docs therefore retain the limitation that the **current ordering can detect a replay after GitHub installation-token creation**. Issue #81 remains the acceptance owner. PR #83 proposes the repair **after cryptographic OIDC and target authorization but before** `createInstallationToken()`. That ordering must not be described as protected behavior until integration and operational proof.

## ERD adequacy

A physical relational ERD would be misleading today. The canonical model explicitly separates:

### Persisted runtime state

- distributed rate-limit state;
- OIDC replay state.

### Conceptual/external evidence entities

- `repository_target`;
- `pull_request_snapshot`;
- `source_revision` and `base_revision`;
- `workflow_run`;
- `runner_assignment_evidence`;
- `check_evidence`, `status_evidence`, `review_evidence`, `scanner_evidence`;
- `model_judgement`;
- `writer_lease`;
- `publication_proposal`;
- `operational_acceptance`;
- `release_evidence`;
- `acquisition_evidence`.

`runner_assignment_evidence` is conceptual operational evidence and never turns assignment/start into source correctness or terminal check success. If Noema later owns a durable evidence database, add a physical schema/migration ERD then; do not pretend these conceptual entities are tables today.

## Licensing / IP adequacy

The documentation correctly separates public source visibility from granted rights and technical evidence from owner/legal authority. The active #69 acquisition lane further exposed that exact release artifacts need an authenticated rights receipt rather than an independent metadata claim.

The canonical release/acquisition contract now expects a digest-bound `artifact_rights_metadata` receipt when an artifact exposes rights metadata. PR #69 also demonstrates why parser ambiguity is part of acquisition integrity: duplicate decoded JSON keys and malformed UTF-8 must fail closed before a rights or revenue value can become evidence. These are active-PR technical controls, not legal clearance.

## Security documentation adequacy

The runtime and automation threat models intentionally remain separate. PR #72 owns coordinated disclosure text and the read-only setting audit; issue #73 owns administrator setting, notification/staffing evidence and a benign exercise. A passing setting probe is not release, staffing or incident-response evidence.

Private-target reviewer authentication is separately Proposed on #85. Public-target CI is not operational proof of private repository authority.

## Standards / doctoring adequacy

Current doctoring is sufficient for the present architecture. Add or update a primary-source citation only when it materially supports a product/technical decision. Prefer final normative standards, identify drafts as drafts, and keep changing-source verification dates in focused doctoring rather than copying mutable facts into every high-level document.

## Protected-main acceptance

The documentation set is not Accepted merely because the files exist on #71. Protected-main acceptance requires:

1. current exact-head documentation/application checks appropriate to the evidence class;
2. inherited dependency-security failure removed by #76 rather than waived;
3. current findings resolved or explicitly classified stale/incorrect;
4. actual applicable governance and qualifying independent review;
5. protected merge of #71;
6. post-merge confirmation that the same canonical graph is discoverable on protected `main`;
7. protected-main operational proof before Proposed privileged/control behavior becomes Accepted/Implemented.

## Remaining gaps

### G-01 Enforceable main governance

Issue #27 remains the live external/control owner; PR #87 strengthens repository-owned audit detection but cannot create the live ruleset or direct-push/break-glass rejection evidence. ADR-0011 remains Proposed until governance and reviewer eligibility are real.

### G-02 Reviewer/Maintainer App provisioning

Issue #29 remains external operational work. Previously disproven non-collaborator review routes are not approval and should not be spammed until eligibility changes.

### G-03 Dependency remediation / integration

PR #76 is the minimal `nanoid` remediation. Direct-main dependent PRs can remain blocked by protected-main audit until it integrates; do not lower or waive the audit.

### G-04 Package-manager reproducibility

PR #89 owns the current dependency-ordered Node/npm/lockfile/install-script control after #78 was **superseded and closed**. #89 is stacked on #76 and remains Draft until dependency integration, protected-base refresh, eligible central scan and normal governance/review acceptance.

### G-05 Atomic publisher / autonomous continuation / NIM credential compartment

PR #80 owns the proposed publisher and repository-consumed work-conserving scheduler/security boundary. External scheduler prompt behavior is not protected-main implementation evidence.

### G-06 Coordinated vulnerability disclosure

PR #72 provides policy/read-only setting audit; issue #73 owns operational setting/notification/exercise evidence.

### G-07 Release/deployment evidence

Require immutable release publication, exact SBOM/provenance, protected environment governance, deployment identity, production smoke/KPI provenance and rollback/recovery evidence before release claims.

### G-08 Commercial/acquisition evidence

Customer/pilot, revenue/LOI/pipeline, support/cloud/credential ownership and transfer evidence remain external and cannot be fabricated by documentation.

### G-09 Replay claim before privileged token mint

Issue #81 remains open. Protected `main` can still detect a replay only after the privileged GitHub installation-token creation side effect. PR #83 contains the active repair after verified/authorized OIDC and target authorization but **before `createInstallationToken()`**; it is stacked on a moving predecessor and is not protected truth until dependency-ordered integration and operational proof.

### G-10 Private-target reviewer authentication

PR #85 remains active. Acceptance requires a real private ContextualWisdomLab target on which the Noema App is installed, exact-head evidence collection and no permission broadening.

### G-11 TypeScript public API documentation gate

Issue #82 / PR #86 remain active. Deterministic public-export inventory and beginner-readable JSDoc must reach the protected lineage before this is complete.

### G-12 Coverage truthfulness

Issue #84 remains open. Broad V8 exclusions around security-critical code must not make configured 100% coverage look like exercised behavior. Remove unjustified exclusions after the shared source ownership stabilizes and replace them with realistic tests.

### G-13 Licensing/IP transfer and exact-release rights evidence

Issue #5 owns the owner/legal outbound-rights decision and contributor/assignment/operational ownership evidence. PR #69 owns technical consistency, including digest-bound `artifact_rights_metadata`, exact artifact/revision identity, duplicate decoded-key rejection and fatal UTF-8 handling. Neither #69 nor this document can choose the legal posture.

### G-14 Runner assignment observability and historical Actions RCA

Issue #30 owns the historical/intermittent Actions reliability question. PR #88 adds read-only **runner assignment** evidence that distinguishes queued-unassigned, assigned, running, terminal and unknown states from check conclusions. Current jobs receiving runners disproves a current repository-wide Actions-disablement explanation, but billing/runner-group/enterprise-policy history remains external unless live administrative evidence proves it.

## 10. Documentation-to-execution handoff

A prose verdict is not sufficient remediation. When this audit identifies a stale or contradictory artifact, **documentation assessment must mutate GitHub state** through the canonical #71 line and add/update the appropriate machine-checkable contract rather than creating a parallel authority.

Likewise, **documentation repair is intermediate**. Once the documentation mutation is reviewable or waiting on checks, the loop must return to the highest-value safe non-documentation lane: source defect, security hardening, review remediation, stack repair, operational proof or buyer-visible work.

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

Re-run this audit after material architecture, authority, persistence, release or product-boundary change. The audit is sufficient for a run only when:

- every canonical family exists or has an explicit N/A rationale;
- implementation status is not overstated;
- active owner PR/issue is current for every residual gap;
- traceability maps material requirements to source/tests/evidence;
- documentation assessment has changed canonical GitHub state when deficient;
- documentation completion does not terminate the run while safe product/security/operability work remains;
- the double exit sweep finds no further safe handoff or non-documentation action.
