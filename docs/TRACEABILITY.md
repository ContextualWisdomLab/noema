# Noema Requirements and Evidence Traceability

## Purpose

이 문서는 제품 요구사항, architecture decision, 구현 surface, executable test, 운영/외부 evidence의 연결을 유지합니다. 문서 존재 자체는 implementation proof가 아닙니다. Active PR의 구현은 protected-main merge 전에는 `Proposed` 또는 `In review`로 표시합니다.

Noema의 autonomy contract는 다음 한 줄로 요약합니다.

> **RCA → feasibility → action → proof**

Scheduler exit rule은 다음과 같습니다.

> **No early stop**: blocker, pending check, external approval, prompt repair 또는 generic scheduler error 하나가 전체 run의 종료 조건이 아니다.

Deliverable handoff rule은 다음과 같습니다.

> **Intermediate artifact → next executable boundary**: prompt, documentation, design, RCA, test, commit, PR 또는 merge는 다음 안전한 authority/acceptance 단계가 남아 있으면 완료가 아니다.

Current protected-main reference for this traceability refresh is `c85d710804139c0697d7ef8fa47d02b1389e6d84`, where PR #76 integrated the bounded `nanoid@3.3.17` remediation.

## 1. Product requirement traceability

| Requirement | Decision / architecture | Source / workflow | Executable proof | Operational / external proof | Status |
| --- | --- | --- | --- | --- | --- |
| FR-001 liveness/readiness/exchange separation | `ARCHITECTURE.md` runtime boundary | `src/runtime-entrypoint.ts`, `src/entrypoint.ts`, `src/index.ts`; PR #99 proposes `openapi.json` | runtime readiness, worker and smoke tests; PR #99 `test/openapi-contract.test.ts` | deployed `/health`, `/ready`, `/exchange` smoke | Runtime family in review on #71; OpenAPI 3.1 machine contract Proposed/In review on PR #99 |
| FR-002 exact OIDC workflow identity | ADR-0003 | `src/runtime-readiness.ts`, `src/worker.ts` | workflow SHA trust and readiness tests | reviewed Cloudflare binding rollout | In review on #71 |
| FR-003 reusable workflow pair | ADR-0003 | `src/worker.ts` | caller/reusable claim-family regressions | current central workflow OIDC evidence | In review on #71 |
| FR-004 bounded outbound trust | Architecture + runtime threat model | `src/outbound-fetch-policy.ts`, `src/entrypoint.ts` | body, redirect, timeout and origin tests | production telemetry | Implemented family; deployed revision must be live-verified |
| FR-005 distributed rate/replay state | architecture state boundary | `src/rate-limit.ts`, `src/oidc-replay.ts` | limiter, replay and alarm tests | Cloudflare binding/storage evidence | Implemented family |
| FR-006 bounded credential request/response | runtime threat model | entrypoint/outbound policy | request/response-size, timeout and cancellation tests | incident/telemetry evidence | Implemented family |
| FR-007 exact head + live base | ADR-0003 | CI, maintenance, PR #91 lockfile control | exact-head and live-base contract tests | protected-main post-merge run | Partly implemented / Proposed integration |
| FR-008 evidence authority separation | ADR-0001/0011 | commercial-readiness + governance audit | check/status/review collision tests | issue #27 ruleset + qualifying independent approval; issue #29 App eligibility | Architecture established; live governance incomplete |
| FR-009 full pagination | ADR-0001 | reviewer/maintenance collectors | pagination regressions | real high-cardinality PR evidence | Implemented family |
| FR-010 write-time stale refusal | ADR-0004 | connector writes and PR #80 publisher | stale-head/blob/ref tests | concurrent writer exercise | Proposed integration on #80 |
| FR-011 current finding classification | ADR-0002 | hourly maintenance process | review-thread and failure-path tests | current PR review history | Process requirement |
| FR-012 protected merge | ADR-0001/0003/0006/0011 | governance audit and maintenance loop | deterministic policy tests | issue #27 + issue #29 + current qualifying approval | External incomplete |
| FR-013 OpenCode + NVIDIA NIM | ADR-0002/0009 | hourly product development | workflow credential-boundary tests | secret/provider operational proof | Workflow family exists; each revision requires live proof |
| FR-014 three trust domains | ADR-0005 + Architecture/UML | product-development workflow | runner isolation and artifact binding | publisher operational run | Implemented family; #80 hardens publisher |
| FR-015 atomic proposal publication | ADR-0004/0008 | PR #80 | expected-absence ref, cleanup, identity and queue-race regressions | protected-main concurrent exercise | Proposed on #80 |
| FR-016 truthful readiness/acquisition | ADR-0001/0005/0006 | readiness/acquisition scripts | manifest and exact-release `artifact_rights_metadata` tests | KPI, customer, revenue, transfer and owner/legal evidence | Technical controls exist; final evidence incomplete |
| FR-017 canonical documentation graph | this document + docs contracts | PR #71 | documentation architecture and governance-doc tests | protected-main discoverability | In review on #71 |
| FR-018 work-conserving continuation | ADR-0002/0009 | external hourly task + PR #80 policy + issue #96/PR #97 evidence audit | remediation-policy + external-scheduler-evidence contracts | observed multi-lane scheduler execution | External task state + proposed repository evidence validator |
| FR-019 deliverable handoff | ADR-0002 | hourly task, PR #80 policy, PR #71 docs and PR #97 evidence audit | documentation/remediation/scheduler-evidence contracts | protected-main mixed-lane run and double exit sweep | Proposed / In review |
| Runner assignment observability | ADR-0001/0006 | issue #30, historical PR #88, current PR #94 | runner-assignment audit tests | organization billing/policy/runner-group evidence if historical RCA is required | Current implementation in Draft #94; historical cause external |

## 2. ADR traceability

| ADR | Requirement(s) | Current owner | Executable proof | Residual proof |
| --- | --- | --- | --- | --- |
| ADR-0001 Evidence authority separation | FR-008, FR-012, FR-016 | review/evidence/acquisition controls | check/status/review collision and integrity tests | issue #27 plus production/commercial evidence |
| ADR-0002 Work-conserving autonomy | FR-011, FR-018, FR-019 | scheduler prompt, PR #80, PR #71 docs, issue #96/PR #97 | remediation-policy, documentation and scheduler-evidence contracts | observed protected-main/external execution across blocked/actionable lanes |
| ADR-0003 Exact revision/live base | FR-002, FR-003, FR-007, FR-010, FR-012 | runtime trust, CI, PR #91/PR #80 | exact-head/live-base/workflow-SHA tests | protected stack and ruleset proof |
| ADR-0004 Safe repository writes | FR-010, FR-015 | connector/trusted checkout/PR #80 publisher | lease and stale-write tests | concurrent actor exercise |
| ADR-0005 Fail-closed untrusted materialization | FR-014, FR-016 | PR #69, PR #93, validator/publisher paths | descriptor, path and artifact integrity tests | protected validator/publisher proof |
| ADR-0006 Protected-main operational acceptance | FR-012, FR-016, FR-019 | governance, release and deployment evidence workflows | preflight/governance/evidence tests | #27, #29, production/release/deployment receipts, #30 reliability evidence |
| ADR-0007 Package-manager reproducibility | supply-chain NFR | PR #91 | exact Node/npm, install-script and live-base lockfile tests | protected merge and regeneration rehearsal |
| ADR-0008 Atomic proposal publication | FR-015 | PR #80 | expected-absence, exact cleanup, lost-response and PR identity tests | protected concurrent exercise |
| ADR-0009 Central/local automation ownership | FR-009, FR-013, FR-018, FR-019 | `.github` read-only dependency + Noema adapters | workflow-source and trigger-contract tests | central revision compatibility evidence |
| ADR-0010 Private-target reviewer authentication | interoperability / least privilege | PR #92 | private-target auth workflow tests | protected-main review of a real **private target repository** |
| ADR-0011 Independent reviewer governance | FR-008, FR-012 | issue #27, issue #29 and PR #90 | independent-review documentation + governance audit tests | live ruleset, reviewer eligibility and **qualifying independent approval** |

## 3. Current successor and historical-lineage map

Historical checks, reviews and PR-body statements do not transfer to successor heads.

| Workstream | Current owner | Historical lineage | Current boundary |
| --- | --- | --- | --- |
| Protected dependency baseline | protected `main` / PR #76 | #75 | Integrated; `nanoid@3.3.17` protected truth |
| Main governance and scan guidance | #27/#90 | #87 | Source audit Ready; live ruleset and formal approval external |
| Deterministic package manager | #77/#91 | #78, #89 | Ready; protected merge + rehearsal pending |
| Private target auth | #29/#92 | #85 | Ready source; App provisioning and private-target exercise pending |
| Exact patch quarantine | #9/#93 | #65 | Clean protected-main successor; governance/approval pending |
| Runner assignment observability | #30 / PR #94 | PR #88 | Draft stacked on #91; Security Scan deferred until protected-base trigger |
| Coordinated vulnerability disclosure | #73/#95 | #72 | Clean direct-main successor; technical checks green, live setting/staffing/exercise external |
| External scheduler continuation evidence | #96/#97 | generic scheduled-task failures / prompt-only evidence | Draft repository evidence validator; external task activation/execution remains separate authority |
| Machine-readable HTTP API contract | PR #99 | prose-only HTTP contract | OpenAPI 3.1 + executable structural contract are Proposed/In review; exact-head technical gates passed before Ready transition, independent review and protected merge still govern acceptance |
| Atomic publisher and scheduler continuation | #80 | prior scheduler/publisher line | Proposed; protected lineage convergence and operational proof pending |
| Replay before privileged token mint | #81/#83 | pre-#83 protected behavior | Draft; rebuild after #71 integration |
| Public API documentation | #82/#86 | initial direct-main line | Draft; refresh after security ownership converges |
| Acquisition manifest integrity | #68/#69 | pre-#91 package baseline | Draft; rebuild after #91 integration |
| Validator image supply chain | #66/#67 | stacked on historical #65 | Must restack onto #93 lineage before publication/activation |

This table is navigational only. Every run must refetch live GitHub state.

## 4. Security, licensing and standards traceability

Primary-source rationale and APA 7 bibliography remain in focused doctoring, `docs/LICENSING_AND_IP_TRANSFER.md` and threat models.

| Decision source | Product decision | Repository evidence |
| --- | --- | --- |
| NIST SP 800-218 SSDF | secure development evidence and no gate bypass | doctoring, security and CI contracts |
| SLSA source/provenance concepts | immutable source distinct from moving ref; release provenance distinct from review | ADR-0003/0006 and release evidence scripts |
| GitHub Actions OIDC | paired caller/reusable workflow ref + SHA | runtime source and trust tests |
| GitHub REST/GraphQL | checks, statuses, reviews and threads stay separate and fully paginated | ADR-0001 and evidence collectors |
| GitHub workflow-job metadata | runner assignment is operational evidence only | issue #30, PR #88 historical lineage, PR #94 current implementation, TRD/UML/ERD |
| GitHub ruleset/review semantics | formal current-head approval requires eligibility and live policy | ADR-0011, issue #27, issue #29, PR #90 |
| GitHub App installation tokens | workflow-repository authority is not reused for a private target | ADR-0010 and PR #92 |
| GitHub private vulnerability reporting | source policy/read-only audit is separate from live setting, reporter UI, staffing and exercise | issue #73, PR #95; PR #72 historical lineage |
| External scheduler evidence | task/prompt claims are not repository execution evidence; retained records must be bounded and credential-free | issue #96, PR #97, ADR-0002/0006/0009 |
| Conditional Git mutation | server-checked identity instead of assumed lease | ADR-0004/0008 and PR #80 |
| Cloudflare bindings and Durable Objects | request-scoped capabilities and cross-isolate rate/replay state | runtime source/tests |
| OpenAPI 3.1 machine contract | public HTTP interoperability is versioned and machine-readable without inventing environment-specific deployment hosts | PR #99 `openapi.json` + `test/openapi-contract.test.ts`; Proposed/In review until protected merge |
| SPDX/npm/OCI rights metadata | package or artifact metadata cannot invent owner/legal authority | licensing/IP docs, issue #5, PR #69 |
| Exact-release rights evidence | digest-bound `artifact_rights_metadata`; duplicate decoded keys and malformed UTF-8 fail closed | PR #69 acquisition integrity |

## 5. Review / merge evidence traceability

```text
repository_target
→ pull_request_snapshot
→ source_revision + base_revision
→ workflow_run
→ runner_assignment_evidence
→ check_evidence
→ status_evidence
→ scanner_evidence
→ review_evidence
→ model_judgement
→ live ruleset / applicable approval policy
→ merge_authority
```

Runner assignment answers whether a job was queued without assignment, assigned, running, terminal or unknown. It does not satisfy a required check. Historical PR #88 established the evidence family; current PR #94 owns the clean repository implementation. A platform or organization root cause remains unproven without authorized evidence.

There is no shortcut from model judgement, commit status or runner assignment to merge authority. Under **ADR-0011 Independent reviewer governance**, review evidence becomes a qualifying independent approval only when the formal GitHub review is `APPROVED`, the reviewer is eligible under live policy, the reviewer is not the author, the review applies to the unchanged current head, and stale-review semantics are satisfied.

## 6. Deliverable handoff traceability

```text
prompt update → repository-consumed policy and executable contract
RCA → feasible action
design → implementation
test → production code
documentation assessment → canonical repository files
local changes → intentional commit → pull request
pull request → exact-head checks → review remediation → protected merge
protected merge → protected-main operational acceptance
next executable queue item → double exit sweep
```

A generic scheduler error is evidence of an uncompleted invocation, not a hidden root cause and not completion. Prompt repair earns no repository completion credit. Issue #96 and PR #97 own the bounded repository-side validation of retained external-scheduler evidence; they do not enable or operate the external task. A blocked arrow defers only that lane; documentation repair is intermediate and must return to a non-conflicting source, review, stack, operational or buyer-visible lane.

## 7. Release / deployment / acquisition traceability

```text
protected source
→ release verification
→ package + SBOM + provenance
→ owner/legal licensing decision
→ exact-release artifact_rights_metadata when applicable
→ dependency-license + NOTICE inventory
→ contributor/IP ownership and assignment provenance
→ immutable release publication receipt
→ protected environment governance
→ production deployment receipt + smoke/KPI provenance
→ customer/revenue/transfer-evidence.json
→ acquisition audit
```

Each arrow requires independent evidence. Earlier-stage success never fabricates a later-stage artifact. PR #69's exact-release rights control remains active-PR technical evidence until protected integration.

## 8. Documentation completeness and acceptance

| Family | Canonical source | Current assessment |
| --- | --- | --- |
| PRD | `docs/PRD.md` | Design sufficient; successor/status refresh required when live ownership changes |
| TRD | `docs/TRD.md` | Design sufficient; current package, runner, disclosure, scheduler-evidence and private-target successors must remain aligned |
| Architecture | `ARCHITECTURE.md` | Proposed canonical architecture on #71 |
| ADR | `docs/adr/` | Eleven-decision baseline sufficient; status remains evidence-bound |
| UML | `docs/UML.md` | Component, sequence, state and deployment views sufficient |
| ERD | `docs/ERD.md` | Persisted Durable Object state and conceptual evidence entities correctly separated |
| API contract | `docs/api-spec.md`; PR #99 `openapi.json` | Prose contract exists; machine-readable OpenAPI 3.1 contract is Proposed/In review on #99 and must not be described as protected truth before merge |
| Security | runtime/automation threat models + #73/#95 | Design substantial; live private-reporting setting, staffing and exercises incomplete |
| Test/operability | `docs/TEST_STRATEGY.md`, `docs/OPERABILITY.md` | Design substantial; protected operational evidence incomplete; #96/#97 separately validate retained external-scheduler evidence |
| Licensing/IP | `docs/LICENSING_AND_IP_TRANSFER.md` | Authority model sufficient; legal and transfer evidence incomplete |

Protected-main acceptance requires current exact-head checks, zero valid unresolved findings, actual live governance, qualifying independent approval where required, protected merge, discoverability on `main`, and protected-main operational proof before Proposed behavior becomes Accepted/Implemented.

## 9. Update rule

After every material product, authority, persistence, stack, release or operational change:

1. refetch protected main and all active owners;
2. update PRD/TRD status only when product or technical meaning changed;
3. update Architecture/UML/ERD only when topology, flow, state or persistence meaning changed;
4. add an ADR only for a new durable choice, not for every bug or successor PR;
5. update this traceability and the documentation gap audit for successor ownership and evidence state;
6. keep active-PR behavior Proposed/In review;
7. execute the next safe non-documentation lane and perform a double exit sweep.