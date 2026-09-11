# Noema Product and Technical Gap Baseline

## Authority and update rule

이 문서는 protected source, active candidate, transient workflow evidence와 foreign-owner authority를 분리한다. Open PR exact head, protected base, required workflow, review thread, release와 central dependency는 mutation·merge·release 직전에 다시 읽는다. predecessor GREEN, queued/pending/in_progress/skipped/cancelled run, 오래된 PR base snapshot과 scanner/model judgement는 다음 revision의 merge authority로 전용하지 않는다. queued는 GREEN이 아니다.

Current protected source는 mutation·merge·release 시점에 live protected `main`을 다시 조회해 결정한다. 이 문서 안의 exact source SHA는 dated observation 또는 protected history일 뿐 future merge 뒤 evergreen current authority로 사용하지 않는다. Dated protected observation for this repair는 `main@98942c88c228c18d44808db1c29bd8f165aa4167`이며, 이 revision은 #605의 Workflow / Task exact-object operability source까지 포함한다.

Dated central control-plane observation for this repair는 central `.github/main@cb0872c9a20d5584703dffacca65c096fc034c6c`다. Noema runtime의 reviewed immutable central consumer pin은 `c9052e607e5f3cc76e73207e7786b21500721b79`이고 runtime authority 표현은 `ALLOWED_WORKFLOW_SHA = c9052e607e5f3cc76e73207e7786b21500721b79`다. Moving foreign head와 reviewed immutable pin을 같은 권위로 취급하지 않으며 central moving head가 전진했다고 consumer pin을 자동 승격하지 않는다.

Protected history에는 merged PR #535 exact `82b20b293f0a5f0ac0e69857c1b61dddfe478491`, merged PR #540 exact `05bc2d47c3899ebe17538070f9a30172f90307ac`, merged PR #542 exact `ca839298fcaeec409091dc909789b6f87eb67fdc`, merged PR #547 exact `30b7e7e5cdab8de65715834a16f994b2047eafa6`, merged PR #550 exact `f2ec2dc6709814070cc3e3d6932ce280aee966db`, merged PR #553 exact `3bd9f543e97ce856f78b1c608141436298ce9e74`, merged PR #558 exact `2f91bf8641212ecae435b5fbcc9084cc0acd6295`, merged PR #556 exact `860714cba46dba06260a5dce09d0e9152fcb0a8c`, merged PR #560 exact `5aab7c098f3478069127f34e398326415ec599a4`, merged PR #582 exact `0f20a4dc78e423fd5df49e137a4eb286c7075ea4`, documentation-authority integration #583, protected procedural graph source #585/#586, documentation convergence #587/#588/#590/#595, workflow-backed current-state integration #589, procedural decision/evaluation/authentication integrations #591/#592/#593/#594/#596, State / Checkpoint history #597, Policy / Approval CAS #601, publication preflight #603, 그리고 Workflow / Task exact-object operability integration #605가 포함돼 있다. 이 식별자는 역사 증거이지 open-candidate authority가 아니다.

이 baseline과 executable documentation-authority test는 active documentation-authority lane 하나만 write한다. mutation 직전 open PR/Issue/branch를 fresh-read해 writer를 결정하며 merged/closed historical PR 번호를 active sole writer로 고정하지 않는다. 다른 feature lane의 과거 baseline blob은 ordinary/non-force semantic convergence 때 current authority로 승계하지 않는다.

## Canonical product boundary

Noema Core Domain은 Agent Runtime과 Workflow / Task Execution이다. Tool / Capability Boundary, State / Checkpoint, Isolation Integration, Policy / Approval, Observability, Recovery는 명시적 bounded context다. Execution identity, side-effect authority, claim/checkpoint CAS, cancellation/recovery invariant와 Noema-owned product/role/time approval issuance는 Noema 경계에 남긴다.

`contextual-orchestrator`는 provider/model discovery, routing, retry/failover, test-time compute와 provider credential을 소유한다. Noema는 released gateway contract와 canonical `orchestrator/free` alias를 소비하며 direct provider SDK, provider key, provider/model/group fallback policy를 소유하지 않는다. `.github`는 organization reusable workflow/control-plane source다. Keyverse는 identity backend다. `quarantine-sandbox-runtime`, Wardnet, EgressWeave, AppGuardrail은 각자의 isolation/security/outbound/scanning truth를 소유한다. Noema는 그 owner evidence를 reference/pin으로 소비할 뿐 foreign implementation이나 domain table을 복제하지 않는다. Cross-service SQL과 mutable sibling PR dependency는 금지한다.

Baseline의 요구·설계·데이터·경계 authority는 `docs/PRD.md`, `docs/TRD.md`, `docs/UML.md`, `docs/ERD.md`, `docs/CONTEXT_MAP.md`다. 이 register는 그 문서와 ADR을 대체하지 않고 current Gap/Action/Status를 exact source·PR·workflow evidence에 결합한다. ADR 0015는 protected source에 포함됐지만 상태는 `Proposed`이며 production activation-authority integration, deployed lifecycle operability/recovery evidence, immutable shared-contract consumption, live pilot와 release evidence가 남아 있다. ADR 0017도 `Proposed`다.

Protected #585/#586은 bounded Noema Agent Runtime advisory graph/session mechanics를 구현했고 protected #585/#586/#589 lineage는 기존 Workflow / Task Execution authority를 current-state ACL로 재사용한다. Protected #597은 bounded durable evaluation/rejection history를 기존 State / Checkpoint에 추가했고 #601은 별도 Noema Policy / Approval CAS를 추가했다. Protected #603 publication preflight는 current State / Checkpoint와 Policy / Approval을 안정적인 double-read window에서 다시 읽고 exact graph/history/evaluator/signer/approval identity를 결합하지만 `publicationAuthorized:false`와 `activationAuthorized:false`를 유지한다. 실제 graph publication, current non-workflow lifecycle/revocation, live Keyverse/owner signer trust, released wire contract, deployed evidence, canary/rollback과 product outcome은 별도 authority다.

## Integrated exact-claim evidence — issue #555 / merged PR #556

Protected #556는 raw source context가 producer-authenticated finding authority로 자동 승격되지 않도록 exact claim/run evidence를 결합한다. Source integration은 execution/research producer, immutable Noema release 또는 released central consumer를 증명하지 않는다.

## Integrated external-extension admission — issue #545 / merged PR #560

PR #560 exact `5aab7c098f3478069127f34e398326415ec599a4`는 application CI `34289599257`, reviewer-ci, required Security Scan, patch-validator-image `34289599248` terminal SUCCESS와 clean review authority를 충족한 뒤 normal merge됐다. Resulting protected merge는 GitHub-verified `e3aa77c3f678336c548440f355f988345b0ba976`다. 이 integration은 source/catalog/scanner authority와 Noema Policy / Approval issuance를 분리하고, Noema Policy / Approval issuance가 product/role/time grant를 소유하도록 한다.

Runtime-current authority RED `4be371ec08b852f4d00829ba5aa6936df6564b5e`는 caller event time을 backdate해 만료된 authority를 행사할 수 있던 경로를 고정했고 production source는 runtime wall clock을 별도 currentness authority로 검증한다. Replay semantic RED `cb8ad638875b761aea70aba78a480bd5031c4d7d`는 동일 invocation identity의 semantic substitution을 고정했고 replay는 complete normalized invocation envelope에 결합됐다. Unbound core-receipt RED `5a50a9bcfe12f3938b30e4a3cb15af8d30134391` 뒤에는 public binding이 없는 retained receipt를 fail closed하도록 수리했고, activation 직전 policy drift/revocation도 다시 읽는다. Invocation에서는 admission-bound live authority substitution을 거부한다.

Exact-admission provenance RED `0a32ee0a88378931a07b7e3b61cc31e3b494a7ab`는 source-admission provenance를 runtime authority에 결합했다. Plaintext replay-retention RED는 reversible request plaintext를 장기 보유하던 경로를 제거했고 Worker Web Crypto `crypto.subtle.digest("SHA-256", ...)`가 digest primitive를 소유한다. Hosted application CI `34230994573`에서 드러난 stale fixture 수리는 `532cfaadf655d3158434db8a1c3a985a33ad3a9f`를 포함한 historical Git lineage에 남아 있다.

Protected source는 durable append-only lifecycle evidence의 prerequisite일 뿐이며 mutable `context-graph-contracts` branch/PR/package를 production authority로 소비하지 않는다. 외부 marketplace metadata만으로 live plugin installation 또는 buyer completion을 주장하지 않는다. Release/deployment/legal evidence도 별도다.

## Protected external-extension lifecycle persistence and operability — issue #561 / merged PRs #574–#582

Protected source는 append-only external-extension lifecycle ledger, CAS/idempotent replay, restart/current projection, complete audit path, SQLite-backed Worker Durable Object binding과 exact stream-scoped `read_operability`를 보유한다. Lifecycle `read_operability`는 `{ database_size_bytes }`만 반환하며 foreign-owner truth나 lifecycle payload를 metrics authority로 복제하지 않는다.

Status는 **production activation adapter + deployed operability/recovery/release evidence open**이다. Actual deployed SQLite Durable Object에서 realistic read/contended-append denominator, exactly-one-winner CAS, >128-event continuity, malformed/truncated-state rejection, exact-object storage growth, p95 ≤20 ms where synchronous, PITR/equivalent recovery 및 immutable deployment/release provenance가 필요하다.

## Protected procedural graph advisory source — issue #584 / merged #585 + #586 + #589 + #597 + #601 + #603

Protected source는 immutable bounded procedural graph/session admission, deterministic traversal, explicit abstention, workflow-backed current-state ACL, paired evaluation identity, authenticated signed evaluator handoff, bounded durable evaluation/rejection history, Noema Policy / Approval CAS와 #603 publication preflight를 포함한다. #601 approval/revocation event와 #603 preflight receipt는 모두 `activationAuthorized:false`이며 preflight는 `publicationAuthorized:false`다. ADR 0017도 `Proposed`다.

Released procedural graph schema는 `context-graph-contracts`, signer trust와 key custody는 Keyverse/owner, provider routing은 `contextual-orchestrator`, product outcome은 consumer product owner가 소유한다. Noema는 실제 graph publication transaction, immutable release, live trust/lifecycle authority와 matched canary evidence 없이 publication/activation을 주장하지 않는다.

## Protected Workflow / Task operability source — issue #541 / merged PR #605

PR #605 exact `b4fd8abb77a69847655e04a03fa63a72ea6d56b4`는 application CI `34542741791`, reviewer-ci `34542741784`, required Security Scan `34542741748`, patch-validator-image `34542741760` terminal SUCCESS와 clean exact-head review 뒤 normal merge됐다. Resulting protected merge는 GitHub-verified `98942c88c228c18d44808db1c29bd8f165aa4167`이다.

Protected #605는 기존 execution-scoped `NOEMA_WORKFLOW_STATE` private command surface에 observation-only `read_operability`를 추가한다. Router는 admitted plan에서 canonical object identity를 다시 도출하고 caller-only field를 private transport에서 제거한다. Durable Object는 `DurableWorkflowStateRepository.readState(plan)`으로 retained execution-plan/state authority를 먼저 검증한 뒤에만 `ctx.storage.sql.databaseSize`를 읽어 `{ database_size_bytes }`만 반환한다. Uninitialized/malformed/mismatched retained authority, foreign object routing과 unavailable/throwing/negative/non-integer storage metadata는 fail closed한다. 두 번째 state/metrics store, public route, mutation/retry/recovery authority는 만들지 않는다.

ADR 0013은 `Proposed`다. Source-level exact-object observation은 deployed Durable Object transaction/restart/recovery, representative storage-growth denominator, synchronous-path p95, PITR/rollback 또는 immutable release evidence가 아니다. #541의 다음 acceptance는 exact immutable release/deployment/object/workload/window/retention에 결합된 before/after storage evidence와 실제 transaction/restart/recovery 및 rollback rehearsal이다.

## Evidence and merge rules

Review resolution, CI, reviewer-ci, required Security, image/SBOM/provenance, branch ancestry, release는 separate evidence classes다. Every source mutation/restack invalidates predecessor workflow evidence. `queued`, `pending`, `in_progress`, `skipped`, `cancelled`, stale 또는 absent-required evidence는 passing이 아니다.

Normal merge requires unchanged exact head, independently refreshed live base/head, no valid unresolved review finding, applicable required terminal-success gates and no foreign-owner/protected-contract regression. Concurrent commits나 pushes 자체를 race로 단정하지 않는다. Wrong base/conflict, stale ADR, mutable dependency, missing fixture/contract, single-writer 위반은 force push나 destructive rebase가 아니라 ordinary/non-force semantic convergence로 수리한다.

PR 0은 useful work를 닫아 제조하지 않는다. Open lane은 normal merge 또는 verified successor가 모든 유효 delta/test/fixture/contract/evidence를 완전히 승계한 경우에만 사라진다. Blocked lane은 자기 lane만 막고 unrelated safe review, owner-path repair, docs-to-code repair와 buyer-gap work는 계속한다.

## Commercial gap register

| Priority | Gap | Buyer/operator impact | Current owner | Status | Authoritative completion evidence | Next executable action |
| --- | --- | --- | --- | --- | --- | --- |
| P0 | Exact-claim evidence supply chain | producer evidence 없는 tool/research claim이 reviewer authority가 될 위험 | protected #556 + issue #555 | source integrated; producer/release/consumer open | authenticated producer + immutable Noema release + released central consumer | released contract 전 mutable consumer bump 금지 |
| P0 | External extension lifecycle evidence | stale/revoked foreign authority 또는 local lifecycle source가 production truth로 오인될 위험 | protected #574–#582 + issue #561 | production activation adapter + deployed operability/recovery/release evidence open | immutable owner refs + Noema approval + deployed p95/contention/storage/recovery | immutable owner evidence 준비 뒤 fail-closed adapter 검증 |
| P0 | Procedural graph publication boundary | advisory/evaluation/preflight가 publication/activation으로 오인될 위험 | protected #585/#586/#589/#597/#601/#603 + issue #584 | source integrated; publication/activation unavailable | released graph contract + live signer trust + lifecycle/revocation + deployed evidence + graph publication/canary | prerequisites 전 graph publication fail closed 유지 |
| P0 | Durable workflow/state production evidence | source Durable Object logic·object-size observation이 deployed recovery/SLO로 오인될 위험 | protected #542 + #605 / ADR 0013 / issue #541 | source + exact-object observation integrated; ADR 0013 Proposed | immutable release/deployment + exact-object transaction/restart/recovery + representative storage-growth denominator + p95 + PITR/rollback | approved deployment owner에서 exact protected release 대상으로 runtime/recovery receipt 확보 |
| P0 | Protected-main governance closure | Security workflow 하나로 PR/review/history/deletion/bypass 통제를 과대 주장할 위험 | issue #27 | external control evidence open | live ruleset + PR/review/conversation/history/deletion + bypass evidence | admin/owner control을 독립 검증 |
| P0 | Patch-validator operational publication | PR image CI가 immutable runtime publication으로 오인될 위험 | issue #66 | source/image integrated; publication open | protected-main execution + immutable image/signature/SBOM/provenance/rollback | operational receipt 뒤 publication/signing 검증 |
| P0 | Authentic production KPI evidence | synthetic/source KPI가 실제 운영 성능으로 오인될 위험 | issue #3 | >=30-day production window absent | authenticated production bytes + provenance + strict KPI gate | 실제 production evidence만 수집 |
| P0 | Acquisition coordination | source/docs completion이 buyer/legal/transfer readiness로 오인될 위험 | issue #5 | evidence families incomplete | exact release/deployment/operational/legal evidence | owner별 evidence family 수렴 |
| P0 | External Maintainer/Reviewer App identity | source preflight가 실제 App installation/reviewer authority로 오인될 위험 | issues #29 / #227 | live identity evidence absent | installation/key custody/permission/reviewer eligibility | external control-plane에서 독립 검증 |

## Release boundary

Dated release observation for this repair (2026-09-11 KST)는 GitHub Releases 0건이다. GitHub release collection에 immutable Noema release가 실제 존재하기 전 version/tag/package/SBOM/provenance/reproducibility/rollback completion을 주장하지 않는다. Release-ready exact protected head에서만 publication하고 consumer는 released/versioned contract만 bump한다.
