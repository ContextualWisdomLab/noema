# Noema Requirements and Evidence Traceability

## Purpose

이 문서는 제품 요구사항, architecture decision, 구현 surface, executable test, 운영/외부 evidence의 연결을 유지합니다. **문서 존재 자체는 implementation proof가 아닙니다.** Active PR의 구현은 protected-main merge 전에는 `Proposed` 또는 `In review`로 표시합니다.

Noema의 autonomy contract는 다음 한 줄로 요약합니다.

> **RCA → feasibility → action → proof**

그리고 scheduler exit rule은 다음과 같습니다.

> **No early stop**: blocker/pending/waiting 하나가 전체 run의 종료 조건이 아니다.

Deliverable handoff rule은 다음과 같습니다.

> **Intermediate artifact → next executable boundary**: prompt, documentation, design, RCA, test, commit, PR 또는 merge는 다음 안전한 authority/acceptance 단계가 남아 있으면 완료가 아니다.

## 1. Product requirement traceability

| Requirement | Decision / architecture | Source / workflow | Executable proof | Operational / external proof | Status |
| --- | --- | --- | --- | --- | --- |
| FR-001 liveness/readiness/exchange separation | `ARCHITECTURE.md` runtime boundary | `src/runtime-entrypoint.ts`, `src/entrypoint.ts`, `src/index.ts` | runtime readiness, worker, smoke tests | deployed `/health` `/ready` `/exchange` smoke | In review on #71 |
| FR-002 exact OIDC workflow identity | ADR-0003 | `src/runtime-readiness.ts`, `src/worker.ts` | workflow SHA trust / readiness tests | reviewed Cloudflare binding rollout | In review on #71 |
| FR-003 reusable workflow pair | ADR-0003 | `src/worker.ts` | reusable claim-shape regressions | current central workflow OIDC evidence | In review on #71 |
| FR-004 bounded outbound trust | `ARCHITECTURE.md`, threat model | `src/outbound-fetch-policy.ts`, `src/entrypoint.ts` | outbound policy/body/redirect/timeout tests | production request telemetry | Implemented family; exact deployed revision must be live-verified |
| FR-005 distributed rate/replay state | architecture state boundary | `src/rate-limit.ts`, `src/oidc-replay.ts` | distributed limiter/replay/alarm tests | Cloudflare binding/storage operational evidence | Implemented family |
| FR-006 bounded credential request/response | threat model | entrypoint/outbound policy | body-size, response-size, timeout tests | incident/telemetry evidence | Implemented family |
| FR-007 exact head + live base | ADR-0003 | CI/maintenance/lockfile control | exact-head contract tests; live-base tests on #89/#80 | protected-main post-merge run | Partly implemented / Proposed integration |
| FR-008 evidence authority separation | ADR-0001/0011 | commercial-readiness policy + main-governance audit | check/status/review collision tests; independent-review governance contract | issue #27 enforceable governance + qualifying independent approval; issue #29 reviewer/App eligibility | Architecture Accepted / review-governance Proposed |
| FR-009 full pagination | ADR-0001 | reviewer/maintenance collectors | pagination regression tests | real high-cardinality PR evidence | Implemented family |
| FR-010 write-time stale refusal | ADR-0004 | connector writes, maintenance/publisher | stale-head/blob/ref tests | writer-race exercise | Proposed integration on #80 |
| FR-011 current finding classification and repair | ADR-0002 | hourly maintenance process | review-thread and failure-path tests | current PR review history | Process requirement |
| FR-012 protected merge | ADR-0001/0003/0006/0011 | hourly commercial readiness + main-governance audit | deterministic merge-policy tests; independent-review governance contract | **issue #27** ruleset + qualifying independent approval + direct-push rejection; **issue #29** reviewer/App eligibility | External incomplete |
| FR-013 OpenCode + NVIDIA NIM | ADR-0002 | hourly product development | workflow contract tests | secret/provider operational proof | Implemented workflow family; current active revision live-verified per run |
| FR-014 three trust domains | ADR-0005, `ARCHITECTURE.md`, `docs/UML.md` | product-development workflow | runner-isolation/artifact-binding tests | publisher operational run | Implemented family; PR #80 hardens publisher |
| FR-015 atomic proposal publication | ADR-0004/0008 | PR #80 product publisher | publisher-lease/lost-response/server-identity/queue-race regressions | protected-main concurrent publication exercise | Proposed on #80 |
| FR-016 truthful readiness/acquisition audit | ADR-0001/0005/0006 | acquisition/readiness scripts | manifest/integrity/audit tests, including exact-release `artifact_rights_metadata` parsing | production KPI/customer/revenue/transfer evidence + owner/legal rights evidence | Technical implementation exists; final evidence incomplete |
| FR-017 canonical documentation graph | this traceability + docs contract | PR #71 docs | `test/documentation-architecture-contract.test.ts` + `test/independent-review-governance-docs.test.ts` | protected-main discoverability | In review on #71 |
| FR-018 work-conserving continuation | ADR-0002 | external hourly prompt + PR #80 policy | remediation-policy contract | protected-main scheduler execution and run evidence | Prompt updated; repository implementation proposed on #80 |
| FR-019 deliverable handoff | ADR-0002 | external hourly prompt + PR #80 `AGENTS.md` policy + PR #71 canonical docs | remediation-policy and documentation-architecture contract tests | protected-main mixed-lane run proving prompt/docs/design/RCA/test/PR/merge handoffs and double exit sweep | Proposed / In review |
| Runner assignment observability | ADR-0001/0006 | issue #30 + PR #88 read-only audit | runner-assignment audit contracts + documentation architecture contract | organization Actions billing/policy/runner-group evidence when historical root cause must be proven | Active PR; root cause externally incomplete |

## 2. ADR traceability

| ADR | Requirement(s) | Code / workflow owner | Tests | Residual proof |
| --- | --- | --- | --- | --- |
| ADR-0001 Evidence authority separation | FR-008, FR-012, FR-016 | commercial-readiness, review/evidence scripts | check collision, review-state, acquisition integrity | issue #27 and production/commercial evidence |
| ADR-0002 Work-conserving autonomy | FR-011, FR-018, FR-019 | scheduler prompt, AGENTS/PR #80, canonical docs on #71 | remediation-policy and documentation-architecture tests | protected-main execution over mixed blocked/actionable lanes with complete deliverable handoff |
| ADR-0003 Exact revision/live base | FR-002, FR-003, FR-007, FR-010, FR-012 | runtime trust, CI, #89/#80 | exact-head/live-base/workflow-sha tests | protected ruleset and stack integration proof |
| ADR-0004 Safe repository writes | FR-010, FR-015 | connector/trusted checkout/publisher | publisher lease and stale-write tests | concurrent actor exercise after merge |
| ADR-0005 Fail-closed untrusted materialization | FR-014, FR-016 | data-room integrity, patch validator, proposal verifier/publisher | descriptor/path/artifact/evidence integrity tests | protected-main validator/publisher operational proof |
| ADR-0006 Protected-main operational acceptance | FR-012, FR-016, FR-019 | governance, deployment, release/acquisition evidence workflows | operational-preflight/governance/evidence tests | #27, #29, production/release/deployment receipts; issue #30 runner reliability evidence |
| ADR-0007 Package-manager reproducibility | supply-chain NFR | PR #89, controlled replacement for superseded #78 | deterministic Node/npm, live-base, lockfile policy and install-script tests | protected integration after #76; reviewed toolchain upgrade path |
| ADR-0008 Atomic proposal publication | FR-015 | PR #80 | expected-absence ref, exact cleanup, lost-response, PR identity and queue-race tests | protected-main concurrent publication exercise |
| ADR-0009 Central/local automation ownership | FR-009, FR-013, FR-018, FR-019 | `.github` reusable policy + Noema adapters/orchestration | workflow-source/stack-trigger contract tests | compatibility evidence for central workflow revisions |
| ADR-0010 Private-target reviewer authentication | reviewer interoperability / least-privilege NFR | central reviewer workflow; PR #85 | private-target auth workflow tests + documentation architecture contract | protected-main review of a real private target repository with exact-head evidence |
| ADR-0011 Independent reviewer governance | FR-008, FR-012 | main-governance audit/ruleset + reviewer provisioning | independent-review documentation contract; main-governance audit tests | issue #27 live ruleset + qualifying independent approval; issue #29 reviewer/App eligibility and operational proof |

## 3. Security, licensing, and standards traceability

Primary-source rationale and APA 7 bibliography are maintained in `docs/doctoring/architecture-trust-boundaries.md`, `docs/LICENSING_AND_IP_TRANSFER.md`, and narrower doctoring records.

| Source / standard | Product decision | Repository evidence |
| --- | --- | --- |
| NIST SP 800-218 SSDF | secure-development evidence and buyer-facing traceability; no gate bypass | architecture doctoring, security/test/CI contracts |
| SLSA Source Track | immutable source revision distinct from moving ref | ADR-0003, exact-head CI, workflow SHA trust |
| SLSA Build/Provenance concepts | release provenance separate from source review | ADR-0006, release evidence scripts and acquisition manifest |
| GitHub Actions OIDC reference | paired workflow ref/SHA and reusable job ref/SHA | runtime trust source and tests |
| GitHub REST/GraphQL | check/status/review/thread APIs remain separate and fully paginated | ADR-0001, commercial-readiness/reviewer collectors |
| GitHub Actions workflow-job metadata | runner assignment and job start are operational observations distinct from terminal check conclusions | issue #30, PR #88, TRD/UML/ERD runner-assignment model |
| GitHub required-review and ruleset semantics | counted approval is an eligible formal `APPROVED` review under the live policy; stale approval, comments, checks, statuses, scanners and model output cannot manufacture merge authority | ADR-0011, issue #27, issue #29, independent-review documentation contract |
| GitHub Actions `GITHUB_TOKEN` and GitHub App installation tokens | workflow-repository authority is not reused as private target repository authority; target lookup uses an explicit repository-scoped App token | ADR-0010, PR #85 tests/doctoring |
| Git/GitHub conditional mutation semantics | stale-writer/ref ownership is server-checked instead of assumed | ADR-0004/0008 and PR #80 publisher tests/doctoring |
| Cloudflare bindings | secret/config capability via Worker bindings; request-scoped validation | runtime entrypoint/readiness architecture |
| Cloudflare Durable Objects | cross-isolate rate/replay coordination and current-state alarm handling | rate-limit/replay source/tests |
| GitHub repository licensing guidance | public source visibility does not itself grant reuse/redistribution rights | `docs/LICENSING_AND_IP_TRANSFER.md`, issue #5 |
| npm `package.json` license contract | declared package rights use SPDX, `SEE LICENSE IN <filename>`, or `UNLICENSED` as applicable; `private` is not a license | `docs/LICENSING_AND_IP_TRANSFER.md`, package/rights consistency gates |
| SPDX 3.0.1 license expressions | machine-readable license expressions must use defined SPDX expression syntax when that authority is chosen | `docs/LICENSING_AND_IP_TRANSFER.md`, exact-release dependency-license inventory |
| Exact-release artifact rights evidence | artifact metadata cannot create legal authority; digest-bound `artifact_rights_metadata` must match repository/package/owner-legal evidence and reject ambiguous duplicate-key input | PR #69 acquisition-integrity tests + `docs/LICENSING_AND_IP_TRANSFER.md` |

Draft standards are not promoted to normative requirements merely because they are newer. Doctoring records the verification date and final/draft distinction.

## 4. Review / merge evidence traceability

For one PR snapshot the decision chain is:

```text
repository_target
→ pull_request_snapshot
→ source_revision + base_revision
→ workflow_run
→ runner_assignment_evidence (operational diagnostic; optional per job)
→ check_evidence
→ status_evidence
→ scanner_evidence
→ review_evidence
→ model_judgement (diagnostic, optional)
→ live ruleset / applicable approval policy
→ merge_authority
```

`runner_assignment_evidence` answers whether a workflow job remained `queued_unassigned`, became `assigned_not_started`, ran, terminated, or could not be classified. It never turns assignment into check success: only the relevant terminal `check_evidence` may satisfy a required check. Persistent unassigned state is an issue #30 operational RCA input; PR #88 provides repository-owned read-only observation, while an organization-level billing/policy/runner-group root cause remains external unless live administrative evidence proves it.

The chain intentionally has no shortcut from `model_judgement`, `status_evidence`, or `runner_assignment_evidence` to `merge_authority`. Under ADR-0011, `review_evidence` becomes **qualifying independent approval** only after the formal GitHub review is `APPROVED`, the reviewer is eligible under the live policy, the reviewer is not the pull-request author, the approval still applies to the exact current head, and stale-review semantics are satisfied. A `COMMENTED` review, check run, commit status, scanner result, reaction, or model judgement remains a separate evidence class.

## 5. Deliverable handoff traceability

The autonomous execution chain is:

```text
prompt update
→ repository-consumed policy and executable contract
→ RCA → feasible action
→ design → implementation
→ test → production code
→ documentation assessment → canonical repository files
→ local changes → intentional commit → pull request
→ pull request → exact-head checks → review remediation → protected merge
→ protected merge → protected-main operational acceptance
→ next executable queue item
→ double exit sweep
```

A blocked arrow defers only that lane. A user-visible report is not a valid terminal node. Documentation repair is intermediate and must return to the highest-value non-documentation lane when safe work remains.

## 6. Release / deployment / acquisition traceability

```text
protected source
→ release verification
→ package/SBOM/provenance
→ owner/legal licensing decision + repository/package rights metadata
→ exact-release artifact_rights_metadata receipt when the artifact exposes rights metadata
→ dependency-license + NOTICE inventory
→ contributor/IP ownership + assignment provenance
→ immutable release publication receipt
→ protected environment governance
→ production deployment receipt + smoke/KPI provenance
→ customer/revenue/transfer-evidence.json
→ acquisition audit
```

Each arrow requires independent evidence. Earlier-stage success never fabricates a later-stage artifact. Licensing/IP automation may prove consistency, identity, absence, or parser unambiguity, but it does not replace the authorized owner/legal rights decision. PR #69's exact-release rights receipt is active-PR technical evidence until protected integration.

## 7. Active work classification

This table is navigational, not a substitute for live GitHub state.

| Workstream | Canonical issue/PR | Documentation ownership | Classification |
| --- | --- | --- | --- |
| Architecture + immutable workflow trust | #71 | PRD/TRD/Architecture/UML/ERD/ADR | In review |
| Dependency advisory remediation | #75/#76 | dependency doctoring | In review |
| Package-manager reproducibility | #77/#89 | ADR-0007 + reproducibility doctoring | In review; #89 is the dependency-ordered replacement and #78 is superseded/closed |
| Atomic publisher + realistic RCA + handoff | #80 | ADR-0002/0008 + publisher/remediation doctoring | In review |
| Private target reviewer authentication | #85 | ADR-0010 + private-target reviewer doctoring | In review; protected-main private-repository exercise pending |
| Main governance / independent approval | #27/#87 | ADR-0006/0011 + governance/operational evidence | Repository audit in review; enforceable live rules external |
| Actions runner assignment observability | #30 / PR #88 | TRD/UML/ERD/Traceability + runner audit doctoring | In review; repository-wide disablement disproven by current assigned/running jobs, historical org-level cause external |
| Maintainer/reviewer App provisioning | #29 | Operability + ADR-0006/0011 acceptance evidence | External operational work |
| Quarantined patch validation | #65/#67/#66 | ADR-0005 + validator docs | In review / planned activation |
| Vulnerability reporting operations | #72/#73 | security policy/process | In review / external setting |
| Licensing/IP transfer | #5/#69/#71 | `docs/LICENSING_AND_IP_TRANSFER.md` + acquisition transfer evidence | Repository contract and exact-release `artifact_rights_metadata` enforcement In review; owner/legal and ownership evidence External |

## 8. Documentation completeness matrix

| Family | Canonical file | Completeness expectation |
| --- | --- | --- |
| Product requirements | `docs/PRD.md` | users, problems, modes, FR/NFR, acceptance, non-goals, status |
| Technical requirements | `docs/TRD.md` | runtime/control/evidence/write/release semantics, including runner assignment vs check conclusion |
| Architecture | `ARCHITECTURE.md` | runtime/MSA/trust/failure/authority boundaries |
| Decisions | `docs/adr/` | material choices and consequences |
| UML/control flow | `docs/UML.md` | component, sequences, state machines, topology, runner-assignment operational state |
| Data/evidence model | `docs/ERD.md` | persisted vs conceptual entities and lifecycle, including `runner_assignment_evidence` |
| Test strategy | `docs/TEST_STRATEGY.md` | realistic tests, coverage, security, evidence classification |
| Operations | `docs/OPERABILITY.md` | activation, health/readiness, incident, rollback, operational acceptance |
| Security | `docs/threat-model.md`, `docs/automation-threat-model.md`, active `SECURITY.md` work | runtime + automation threats, disclosure/intake, retention, external setting boundaries |
| Licensing / IP transfer | `docs/LICENSING_AND_IP_TRANSFER.md` | rights authority, package metadata, exact-release `artifact_rights_metadata`, third-party NOTICE obligations, contributor/assignment provenance, transfer evidence |
| API | `docs/api-spec.md` | endpoint/schema/error/security contract |
| Traceability | `docs/TRACEABILITY.md` | requirement/ADR/standard → code/test/evidence |
| Gap audit | `docs/DOCUMENTATION_GAP_AUDIT.md` | baseline sufficiency, residual owners, protected-main acceptance |
| Change history | `CHANGELOG.md` | user/operator-relevant changes under Unreleased/releases |
