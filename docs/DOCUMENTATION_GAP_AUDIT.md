# Noema Documentation Gap Audit

- **Audit date:** 2026-08-09
- **Audit scope:** Noema product, runtime, reviewer/evidence, autonomous maintenance, release/deployment and acquisition-readiness decisions represented by current repository source, active PRs/issues and the associated project conversation.
- **Owning PR:** #71
- **Audit state:** In review; this file is not protected-main evidence until #71 merges.

## Baseline verdict

### Before this audit

**Insufficient as a canonical architecture baseline.** Noema already had substantial high-quality material — API specification, runtime threat model, runbooks, operational/release/acquisition evidence documents, doctoring and the root `ARCHITECTURE.md` being developed in #71 — but key decisions were scattered across PR bodies, issues, workflow source and conversation history.

The most material omissions were:

- no canonical repository PRD;
- no canonical TRD;
- no ADR index/lifecycle and no concise ADRs for evidence authority, autonomous continuation, exact revision/live base and safe writes;
- no UML/control-flow document covering review/maintenance/product-development authority transitions;
- no explicit ERD/domain model distinguishing actual Durable Object persistence from conceptual GitHub/evidence entities;
- no single requirements/standards/evidence traceability matrix;
- no canonical test-strategy document joining exact-head, pagination, LLM, concurrency and operational-acceptance tests;
- no single operability document joining App activation, governance, rollback, incidents and release/deployment acceptance;
- runtime threat modeling did not fully cover autonomous model/verifier/publisher/writer-race and work-starvation threats;
- no durable documentation-gap audit that future automation could use to prevent regression;
- no executable requirement that prompt, documentation, design, RCA, test, PR and merge artifacts hand off to their next safe boundary instead of terminating the run.

### After the #71 documentation expansion

**Substantially sufficient as a proposed product/technical/architecture baseline, but not yet sufficient as an accepted protected-main or acquisition-complete evidence set.**

The repository now has a coherent canonical documentation graph for the product, technical architecture, decisions, diagrams, data/evidence semantics, testing, operations and traceability. The remaining deficiencies are primarily:

1. integration/acceptance of active code/docs into protected `main`;
2. operational governance/App/repository settings that source code cannot prove;
3. security-disclosure policy and repository setting work owned separately by #72/#73;
4. active implementation work whose ADR status must move from Proposed only after merge/operational proof;
5. real production/release/customer/revenue/transfer evidence that cannot be replaced by documentation.

## 1. Documentation family scorecard

| Family | Canonical source | Current assessment | Owner / next action |
| --- | --- | --- | --- |
| README / entry map | `README.md`, `docs/README.md` | **Adequate** | Keep high-level README concise; use docs index for canonical navigation. |
| Product requirements | `docs/PRD.md` | **Adequate, In review** | Merge #71, then update only material product/authority changes. |
| Technical requirements | `docs/TRD.md` | **Adequate, In review** | Integrate #76/#78/#80/#83/#85 semantics only after their protected acceptance. |
| Architecture | `ARCHITECTURE.md` | **Strong, In review** | Keep as root runtime/MSA/trust source of truth and distinguish protected behavior from active proposals. |
| ADRs | `docs/adr/` | **Baseline adequate** | ADR-0010 now records the private-target reviewer authentication choice; Proposed ADRs become Accepted/Superseded only with protected integration evidence. |
| UML / sequences / states | `docs/UML.md` | **Adequate, In review** | Update when control-plane ordering/authority changes are protected-integrated. |
| ERD / domain model | `docs/ERD.md` | **Adequate for current architecture** | Preserve actual-vs-conceptual distinction if a relational evidence store is later added. |
| API contract | `docs/api-spec.md` | **Strong** | Add a generated OpenAPI artifact only if SDK/gateway consumers require machine codegen; do not create schema theatre without a consumer need. |
| Runtime threat model | `docs/threat-model.md` | **Strong for credential exchange** | Keep scoped to runtime/network/credential threats and update replay ordering after #83 integrates. |
| Automation threat model | `docs/automation-threat-model.md` | **Adequate, In review** | Integrate #80 publisher details and #85 private-target bootstrap only after protected merge/operational proof. |
| Vulnerability disclosure / SECURITY | PR #72 `SECURITY.md`, issue #73 | **Incomplete integration / external setting** | Merge reviewed policy and verify private vulnerability reporting setting/process. |
| Test strategy | `docs/TEST_STRATEGY.md` | **Adequate, In review** | Exact-head CI must prove the document contract; no coverage waiver. |
| Operability / runbooks | `docs/OPERABILITY.md` plus specific runbooks | **Strong baseline** | Attach #27/#29 and production operational acceptance evidence. |
| Release / provenance | release docs/scripts and acquisition index | **Design/implementation substantial; operational evidence incomplete** | Verify integrated exact source, SBOM/provenance/publication/deployment receipts before release claims. |
| Traceability | `docs/TRACEABILITY.md` | **Adequate, In review** | Keep requirements/ADR/standards/handoffs mapped to source/test/evidence, including ADR-0010. |
| Doctoring / research standards | `docs/doctoring/` | **Strong, distributed by topic** | Maintain APA 7 primary-source rationale and final-vs-draft standard status. |
| CHANGELOG | `CHANGELOG.md` | **Present and active** | Record user/operator-relevant integrated changes; do not use changelog as architecture source. |
| AGENTS / CLAUDE | `AGENTS.md`, `CLAUDE.md` | **Present** | Keep operational agent rules aligned with canonical docs and avoid duplicate mutable status. |
| Acquisition evidence | buyer/data-room docs + artifacts | **Technically indexed, commercially incomplete** | Real production/customer/revenue/transfer evidence remains external. |

## 2. PRD adequacy

The canonical PRD now covers:

- primary and secondary users;
- buyer/operator problems;
- product principles;
- credential, review, maintenance, product-development and acquisition modes;
- functional requirements FR-001..FR-019;
- security, reliability, quality, supply-chain and operability non-functional requirements;
- standalone + CWL MSA interoperability;
- layered completion semantics from branch implementation through acquisition evidence;
- mandatory deliverable handoff from each intermediate artifact to its next safe boundary;
- explicit non-goals;
- Implemented / Planned / External evidence classification.

### Residual PRD gaps

- market/customer persona validation is not yet backed by actual customer discovery evidence;
- pricing and saleability documents are planning artifacts rather than validated market willingness-to-pay;
- production SLO targets should only become commitments after real production observations and support ownership are established.

These are commercial evidence gaps, not reasons to invent more product-requirement prose.

## 3. TRD adequacy

The TRD now includes the technically material contracts that were previously distributed across workflows/issues:

- exact PR head vs event base vs live base vs synthetic merge vs stack predecessor;
- immutable workflow source ref/SHA pairing;
- check/status/review/scanner/model/merge/release/deployment evidence separation;
- full pagination;
- reviewer eligibility;
- writer lease and conditional writes;
- RCA/feasibility classifications;
- work-conserving priority queue and no-early-stop semantics;
- OpenCode + NVIDIA NIM development credential boundary;
- package-manager/lockfile reproducibility direction;
- coverage/docstring gates;
- release/deployment evidence separation;
- actual Durable Object persistence vs conceptual evidence entities.

### Residual TRD gaps

- #78 must be integrated before repository-wide deterministic package-manager/lockfile policy is an accepted implementation fact;
- #80 must be integrated before atomic publisher and repository-consumed work-conserving scheduler rules are accepted implementation facts;
- exact required check/reviewer policy cannot be made a timeless constant until #27's live ruleset is applied and evidenced;
- Issue #81 remains the protected-main replay side-effect gap until #83 is integrated. PR #83 implements the intended move of the distributed replay claim after cryptographic OIDC and target authorization but before `createInstallationToken()`, while preserving the anti-poisoning invariant that unverified `jti` values cannot consume replay state. Its active-branch implementation is not protected-main fact yet;
- PR #85 implements a private-target review bootstrap in which the first live target PR lookup uses a repository-scoped Noema App token rather than the workflow repository `GITHUB_TOKEN`; ADR-0010 remains Proposed until integration and a real private-target operational exercise.

## 4. ADR adequacy

The ten ADR baseline records the durable decisions that materially affect authority, evidence, autonomous execution and integration:

1. evidence classes remain separate from merge/release/deployment authority;
2. autonomous maintenance is work-conserving, uses RCA/feasibility before escalation, and requires deliverable handoff;
3. acceptance binds immutable source revision and independently resolved live base;
4. repository mutations use normal conditional writes rather than repair-workflow privilege escalation;
5. untrusted source/artifact/model output is promoted to evidence only through fail-closed identity/materialization boundaries;
6. PR verification is distinct from protected-main operational acceptance, release, deployment and commercial evidence;
7. package/lockfile evidence requires deterministic package-manager identity and exact base/source binding;
8. autonomous proposal branch/PR publication is one identity-bound conditional transaction;
9. CWL central reusable policy ownership is separated from Noema-local runtime/orchestration ownership;
10. cross-repository private review binds the first live target lookup to a single-repository, read-only Noema App capability and forbids `GITHUB_TOKEN`/PAT/broad-token fallback.

ADRs 0002, 0003, 0004, 0007, 0008 and 0010 intentionally remain `Proposed` while their owning active implementation is not yet protected-merged/operationally accepted. Narrow implementation details continue to live in the owning doctoring records so the ADRs remain stable and do not duplicate mutable commit/run state.

### ADRs to add only when triggered

Create a new ADR when one of these becomes a durable choice rather than an active implementation detail:

- dedicated patch-validator image publication/activation architecture (#66/#67);
- evidence-store persistence if conceptual ERD entities become a real relational/event store;
- a stable release channel/support policy once first production release is accepted;
- production environment/provider topology if deployment ownership changes materially.

Issue #81/#83 currently refines the already accepted replay/fail-closed trust boundary rather than selecting a separate product architecture. Add or supersede an ADR only if the eventual protected implementation materially changes verified-claims ownership or authority beyond that existing boundary.

## 5. Architecture and UML adequacy

`ARCHITECTURE.md` plus `docs/UML.md` now cover:

- runtime module/layer ownership;
- credential exchange sequence;
- review and maintenance sequence;
- work-conserving RCA/action state machine;
- evidence→review→merge→release→deployment→acquisition state separation;
- product-development model/verifier/publisher sequence;
- reviewer and merge authority flow;
- GitHub/Cloudflare/CWL deployment/control topology.

This is sufficient for current service boundaries. Additional diagrams should be added only for a real new subsystem, not to satisfy diagram count. Protected `main` still has the pre-#83 replay ordering, so the canonical sequence must not present PR #83 as integrated fact. When #83 is protected-integrated, the credential-exchange sequence must show the verified replay claim before privileged GitHub App token minting. Likewise, ADR-0010/PR #85 remains a Proposed reviewer-authentication sequence until protected integration and private-target operational acceptance.

## 6. ERD adequacy

A conventional relational ERD alone would have been misleading because current runtime persistence is Durable Object SQLite state, while much of Noema's evidence is external GitHub state or retained workflow artifacts.

The new ERD therefore explicitly models:

### Actually persisted runtime state

- rate-limit object/bucket;
- OIDC replay object/claim.

### Conceptual evidence/control entities

- repository target;
- pull-request snapshot;
- source/base revision;
- check/status/review/scanner evidence;
- model judgement;
- workflow run;
- writer lease;
- publication proposal;
- operational acceptance;
- release evidence;
- acquisition evidence.

This is **sufficient for current persistence truthfulness**. If a future evidence database is implemented, a physical schema ERD and migration contract must be added then; the current conceptual entities must not be falsely presented as existing tables.

## 7. Security documentation adequacy

The split threat models are intentional:

- `docs/threat-model.md`: credential-exchange runtime, network, OIDC, GitHub App, request/response and state threats;
- `docs/automation-threat-model.md`: model runner, proposal verifier, publisher, writer race, evidence spoofing, prompt injection, rate-limit/provider starvation, governance-document drift and authority collapse.

The remaining public vulnerability-disclosure policy belongs to PR #72 rather than this architecture PR. Issue #73 must prove the repository administrator setting/process; documentation cannot enable it.

The replay-amplification side-effect gap is still a protected-main fact until #83 integrates: **current ordering can detect a replay after GitHub installation-token creation**. Issue #81 therefore remains open as the acceptance owner even though PR #83 now contains an active implementation and realistic regression tests. Repository documentation must not imply that a rejected replay is guaranteed to cause zero privileged upstream token-mint side effects before #83 is protected-integrated and verified.

Private-target reviewer authentication is a separate authority boundary. PR #85 moves the first target-state API read behind the existing single-repository Noema App token and ADR-0010 records that choice as Proposed. Public-target CI is insufficient operational proof; acceptance requires a real private target repository with the App installed and exact-head evidence collection without permission broadening.

## 8. Standards / doctoring adequacy

Architecture doctoring already anchors key decisions in primary sources and APA 7 references including NIST SSDF, SLSA, GitHub OIDC and Cloudflare binding/Durable Object semantics. Narrow active PRs have package/Git/publisher/private-target-authentication-specific primary references.

Gap policy:

- prefer final normative standards over drafts;
- record verification date where a source is likely to change;
- do not copy citations into every high-level document when a canonical doctoring record already owns rationale;
- add a new citation only when it materially supports a product/technical decision.

## 9. Protected-main acceptance

The documentation set is **not Accepted merely because files now exist on #71**.

Protected-main acceptance requires:

1. current #71 exact-head documentation tests and existing application tests pass;
2. security/reviewer checks are terminal and valid for the exact/current evidence class;
3. inherited dependency-security failure is resolved by integrating #76 rather than waived;
4. current review findings are resolved or explicitly classified as stale/incorrect;
5. applicable independent review and live governance are satisfied;
6. #71 is merged under the actual protected policy;
7. the post-merge protected source contains the same canonical files and links;
8. privileged/operational changes receive protected-main operational proof before `Proposed` is relabelled `Accepted`/`Implemented`.

## Remaining gaps

### G-01 Enforceable `main` governance — external

Issue #27 remains live. Repository automation can inspect and fail closed on missing governance evidence, but it cannot substitute prose or a synthetic status for an enforceable ruleset. Required proof includes PR-only mutation, exact-head required checks, applicable independent non-author approval, conversation resolution, direct-push/force-push/deletion rejection and audited break-glass behavior.

### G-02 Reviewer/Maintainer App provisioning — external

Issue #29 remains live. Fresh repository collaborator probes on 2026-08-09 still show `opencode-agent` permission `none` and no usable collaborator permission record for `cwl-noema-review`. Provision the actual reviewer/maintainer identities and retain activation/rollback evidence instead of repeatedly requesting disproven reviewer routes.

### G-03 Dependency remediation / integration — active PR

PR #76 is the minimal `nanoid` remediation and current direct-main dependent PRs may continue to fail `npm audit` until it is integrated. Do not weaken audit to make documentation PRs green.

### G-04 Package-manager reproducibility — active PR

PR #78 owns repository-wide Node/npm/lockfile change control. Documentation describes the intended invariant but does not mark it protected-main complete.

### G-05 Atomic publisher / autonomous continuation — active PR

PR #80 owns production implementation of conditional proposal publication, repository-consumed work-conserving RCA/feasibility policy, deliverable handoff and double-exit-sweep requirements. The external hourly scheduler prompt has been strengthened, but repository ADR status remains Proposed until #80 is integrated and operationally exercised.

### G-06 Coordinated vulnerability disclosure — active/external

PR #72 provides the policy; issue #73 owns the administrator setting and benign end-to-end exercise. Merge policy text must not claim GitHub private vulnerability reporting is enabled without external proof.

### G-07 Release/deployment evidence — external

SBOM/provenance/release/deployment scripts may exist, but a current immutable release publication receipt, protected production governance, deployment attestation, traffic identity, production smoke and KPI provenance are still release/deployment acceptance inputs rather than documentation claims.

### G-08 Commercial/acquisition evidence — external

Real customer/pilot, revenue/LOI/pipeline, IP/license/credential ownership and operational transfer evidence remain necessary before acquisition-readiness claims. Technical documentation cannot fabricate them.

### G-09 Replay claim before privileged token mint — active security PR

Issue #81 identifies the protected-main credential-exchange ordering gap: the distributed single-use replay claim currently occurs after the GitHub installation-token creation side effect. PR #83 implements the narrow repair **after cryptographic OIDC and target authorization but before** `createInstallationToken()`, and adds realistic signed-OIDC/replay regressions while keeping unverified `jti` values outside replay state. Because #83 is still an active stacked Draft and its predecessor #71 has moved, this remains Proposed implementation rather than protected behavior; #83 must be refreshed in dependency order and re-proven before #81 can close.

### G-10 Private-target reviewer authentication — active security/interoperability PR

PR #85 fixes the central reviewer bootstrap so a private target repository is authenticated with the existing repository-scoped Noema App token before the first live PR read. ADR-0010 is Proposed, the workflow change must retain least-privilege read scope and fail closed, and public CI does not satisfy operational acceptance. After protected integration, Noema must successfully review a real private target repository on which the App is installed and retain exact-head evidence before this gap can be marked Accepted.

## 10. Documentation-to-execution handoff

A prose verdict is not sufficient remediation. When the fitness matrix identifies a material missing, stale or contradictory artifact, **documentation assessment must mutate GitHub state** through the canonical branch: add or update the authoritative file, index, ADR status, traceability and machine-checkable contract. It must not create a parallel documentation authority when #71 already owns the repository-wide graph.

Likewise, **documentation repair is intermediate**. Once the documentation change is reviewable or waiting on checks, the loop must return to the highest-value safe non-documentation lane: source defect, security hardening, review remediation, stack work, protected-main acceptance, operability evidence or buyer-visible product work. If that lane is blocked, defer only that lane and rotate.

The mandatory handoff chain is:

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

A run performs a double exit sweep. A user-visible report is not completion while either fresh sweep finds an executable action.

## 11. Future audit rule

The hourly maintenance/development loop should revisit this audit after a material architecture, authority, persistence, release or product-boundary change. A new file family should be added only when the system gains a corresponding real responsibility.

The audit is complete for a run when:

- every canonical family exists or has an explicit N/A rationale;
- implementation status is not overstated;
- active owner PR/issue is identified for every residual gap;
- traceability maps material requirements to source/tests/evidence;
- documentation assessment has changed canonical GitHub state when deficient;
- documentation completion does not terminate the run while safe product/security/operability work remains;
- the double exit sweep finds no further safe handoff or non-documentation action.
