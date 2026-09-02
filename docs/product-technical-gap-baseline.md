# Noema Product and Technical Gap Baseline

## Authority and update rule

이 문서는 제품 요구, protected implementation, active PR, 검증, 운영·배포·상업 증거 사이의 차이를 추적한다. 저장소 파일과 테스트는 해당 revision의 구현만 증명하며, PR 상태는 exact current head와 independently resolved live base에서 다시 확인한다. 운영·배포·고객·매출·법적·release 증거는 각 외부 권한에서 별도로 검증한다. 문서, predecessor check, model review, synthetic fixture 또는 success boolean을 이후 단계의 권위로 승격하지 않는다.

2026-09-03 KST의 protected-source snapshot은 `main@1a868c2dc64e7a94917e9e23e950f521996bf2d5`다. 이 값은 다음 실행에서 반드시 다시 읽는다. PR #530의 Apache-2.0 source grant는 이미 protected main에 병합됐으므로 더 이상 candidate가 아니다. 현재 open issue/PR 번호와 head도 historical locator일 뿐이며 live GitHub 상태가 우선한다.

## Live external observation — 2026-09-03 KST

| Authority | Observation | Consequence |
| --- | --- | --- |
| Source licensing | root Apache-2.0 grant와 product-first README가 protected main에 통합됐다 | Noema-owned source의 outbound grant는 protected truth지만 third-party/package/transfer 권한을 대신하지 않는다 |
| Dependency licensing | issue #531이 `wrangler → miniflare → sharp → @img/sharp-libvips-*` GPL/LGPL-family 개발·빌드 경로 제거를 계속 소유한다 | source Apache-2.0과 별개로 상업용 inbound-tooling gap이 남아 있다 |
| Workflow runtime foundation | PR #528은 admitted Agent Runtime/Workflow/Checkpoint 도메인 경계를 소유하고, issue #541 및 stacked Draft #542가 durable claim/CAS/recovery application boundary를 구현 중이다 | selector candidate를 실행 권한으로 오인하지 말고 protected integration 전까지 active-PR truth로만 취급한다 |
| Actions execution | current Noema exact-head CI/reviewer/image lanes에서 `ubuntu-24.04`, `steps=[]`, runner 미배정 상태가 반복 관찰되며 central `.github#712`가 control-plane RCA를 소유한다 | queued/pre-checkout evidence는 non-passing이며 leaf source나 runner label을 no-op으로 흔들지 않는다 |
| Context Graph / EA | `context-graph-contracts`와 `enterprise-architecture-core`는 현재 GitHub releases가 0이고 Context Fabric writer가 sole source owner다 | open Draft/head를 production dependency나 authoritative EA truth로 승격하지 않는다. released immutable contract가 나올 때 consumer compatibility를 다시 검증한다 |
| Noema release | GitHub releases가 현재 0이다 | source maturity나 active PR check를 immutable product release로 표현하지 않는다 |

## Current baseline

| Requirement family | Canonical decision / boundary | Protected or active implementation surface | Executable proof | Residual evidence | Maturity |
| --- | --- | --- | --- | --- | --- |
| Credential exchange and readiness | Worker trust contract와 runtime threat model | `src/index.ts`, `src/worker.ts`, `src/entrypoint.ts`, `src/runtime-entrypoint.ts`, OIDC/replay/rate-limit modules | typecheck, runtime/API/security tests, exact configured coverage | protected deployment smoke와 실제 binding/storage evidence | Implemented on protected main; operational evidence separate |
| Agent Runtime / Workflow admission | Noema가 runtime lifecycle, admitted Workflow/Task plan, Tool/Capability boundary, State/Checkpoint를 소유하고 foreign domain truth를 복제하지 않는다 | active foundation PR #528의 `src/agent-runtime/`, `src/workflow-task-execution/`, `src/state-checkpoint/` 및 architecture fitness tests | malformed runtime input, DAG/dependency/concurrency, checkpoint admission/replay/conflict regressions | exact-head terminal CI/review/security/image gates와 protected integration | Active PR; not protected truth |
| Durable workflow execution authority | selector와 durable claim을 분리하고 exact execution/plan revision에서 task claim·effect-start evidence·checkpoint CAS·effect-specific recovery를 transactionally 수행한다 | issue #541 / Draft PR #542 `DurableWorkflowStateRepository`, ADR-0013 candidate | concurrent claim, dependency recheck, divergent checkpoint CAS, blocked descendants, bounded retry, cancellation/policy/state-integrity, restart claim reconstruction, effect-start/transition-provenance regressions | runner-executed exact-head typecheck/100% coverage, production composition, real Durable Object runtime transaction evidence, remaining canonical-doc alignment | Active implementation; non-passing until exact-head gates execute |
| Scheduling, cancellation and provenance policy | `workflow-execution-policy.v1`, deterministic `admission_order`, bounded pure/idempotent recovery, no silent side-effect retry; first cancellation identity wins; transition receipts are bounded and payload-minimized | Draft PR #542 | starvation-bound retry, claim-vs-cancellation, post-cancel rejection, distinct claim/effect-start/completion/checkpoint receipts, bounded ledger truncation | current-head executable GREEN plus production caller ordering and restart/operator acceptance | Active implementation; policy not yet protected |
| Reviewer and maintenance control plane | independent App identity, bounded manifest, deterministic fail-closed gates | `reviewer/noema_reviewer/`, maintainer/reviewer workflows, capability-file ingress | reviewer tests, workflow contract tests, current-head review artifacts | App installation/permission/key custody/rotation and publication identity | Source contract implemented; external activation evidence open |
| Hourly product-development loop | `contextual-orchestrator` inference plus separate Maintainer App publication identity | `.github/workflows/hourly-product-development.yml`, orchestrator gateway contract, publication/readiness validators | workflow shape, gateway preflight, lease, stale-head refusal | zero-PR scheduled publication and rollback/recovery exercise | Source implemented; production activation incomplete |
| Patch-validator supply chain | exact source/image/receipt binding and fail-closed vulnerability policy | `Dockerfile.patch-validator`, image workflow, validator/SBOM/receipt modules | build/runtime/smoke/SBOM/vulnerability/receipt tests | protected-main operational receipt, registry digest/signature/attestation | Source implemented; publication evidence incomplete |
| Source licensing | Apache-2.0 for Noema-owned source; private npm metadata and dependencies retain separate authority | protected root `LICENSE`, README, `docs/LICENSING_AND_IP_TRANSFER.md` | protected repository/doc consistency | third-party tooling remediation, future distributable-package metadata when a package channel exists | Implemented on protected main |
| Third-party/tooling licensing | GPL-family packages are not accepted as normal inbound baseline | current lockfile, dependency-license inventory, issue #531, active replacement PR if still current | exact lockfile scan must remove GPL/LGPL/AGPL toolchain path without weakening Worker build/dev/deploy | replacement lockfile plus exact-head CI/security/license evidence | Open compliance gap |
| Context Graph / EA integration | released CGC contract only; EA receives architecture projection, never Agent task/result/reasoning/tool payload as authoritative data | read-only Context Fabric dependency; Noema consumer acceptance lives in Noema tests/ACLs | exact released version/source/artifact/conformance/provenance verification when available | first immutable CGC release, compatible EA publication, Noema version pin/ACL migration | Blocked on owner release; owner path is actionable, mutable PRs are not authority |
| Release and deployment | source → package/image/SBOM/provenance → immutable publication → deployment/rollback | release/publication/deployment/readiness scripts | exact-source/reproducibility/receipt/rollback contracts | one exact protected head with all applicable gates and immutable release | Incomplete; no Noema GitHub release |
| KPI, customer and acquisition | authentic evidence keeps source/time/buyer/legal authority separate | KPI and acquisition manifest/integrity/readiness validators | bounded input/provenance/ordering/integrity tests | authentic 30-day production KPI, customer/revenue and transfer evidence | Incomplete; no commercial-readiness claim |

## Prioritized residual gaps

| Priority | Gap | Buyer/operator impact | Current owner | Authoritative completion evidence | Next executable action |
| --- | --- | --- | --- | --- | --- |
| P0 | Atomic scheduler state-store and recovery | restart/race/cancellation에서 duplicate side effect 또는 forever-pending workflow가 생길 수 있다 | issue #541 / PR #542 | protected exact head에서 atomic claim, effect-start evidence, checkpoint CAS, versioned retry/policy, blocked recovery, cancellation, bounded provenance, restart tests와 100% coverage가 모두 terminal GREEN | #542의 production composition과 remaining canonical docs를 수렴시키고 fresh exact-head gates 및 real Durable Object acceptance를 실행한다 |
| P0 | Actions runner acquisition | required checks가 source checkout 전 멈추면 모든 exact-head 품질·merge evidence가 생성되지 않는다 | central `.github#712` | unchanged current Noema head에 runner가 실제 배정되고 checkout·CI/reviewer/image/security가 실행되어 terminal evidence를 낸다 | central owner repair를 전진시키고 leaf는 다른 독립 work를 계속한다 |
| P0 | GPL-family development/build dependency path | 조직의 상업용 inbound 정책과 npm toolchain이 충돌한다 | issue #531 | exact-head lockfile/inventory에서 GPL/LGPL/AGPL 경로 제거 + Worker dev/deploy/typecheck/tests/security GREEN | commercially compatible toolchain replacement과 lockfile 재검증 |
| P0 | Maintainer/Reviewer App 및 hourly publication identity 활성화 | 자동 유지보수와 독립 리뷰가 production capability로 동작한다는 증거가 없다 | issues #29 / #227 | App 설치·권한·key custody/rotation, 성공 scheduled publication artifact와 rollback | 외부 App 구성을 완료한 뒤 readiness/scheduled acceptance를 실행한다 |
| P0 | protected `main` governance와 live policy 정합성 | source 검증만으로 실제 merge/release 통제를 보장할 수 없다 | issue #27 및 central governance owner | live ruleset/branch-protection과 required workflow/status의 일치 | governance audit 차이를 owning control에서 수정한다 |
| P1 | Context Graph / EA immutable publication | Noema가 shared context contract와 EA projection을 production authority로 소비할 수 없다 | Context Fabric owner | protected release/publication + exact source/artifact digest + conformance/admission + SBOM/provenance/licensing/compatibility | Noema consumer acceptance를 owner RED/GREEN에 연결하고 release 등장 즉시 versioned ACL로 승격한다 |
| P1 | patch-validator operational publication | 검증된 source image의 실제 배포·서명·활성화를 구매자가 확인할 수 없다 | issue #66 | protected-main receipt, registry digest, signature/attestation, activation proof | exact protected source publication pipeline 실행 |
| P1 | authentic 30-day KPI | 신뢰성·성능·운영가치를 fixture가 아닌 실운영 자료로 입증하지 못한다 | issue #3 | production-origin, time-bound, integrity-checked 30-day KPI evidence | 승인된 production source에서 collector/verifier 실행 |
| P1 | release/deployment/acquisition evidence | buyer/legal/commercial 권한 없이 매각 readiness를 선언할 수 없다 | issue #5 | immutable release/deployment/customer/revenue/legal transfer evidence | 선행 evidence family를 충족하고 acquisition audit 재실행 |

## Runtime state-store decision record

문제는 pure selector가 반환한 candidate를 durable execution authority로 승격할 원자적 경계가 없었다는 점이다. in-memory CAS는 process restart를 견디지 못하고, PostgreSQL을 새로 선택하는 것은 현재 Worker runtime에 불필요한 persistence 확장을 만든다. Draft #542는 기존 Cloudflare Durable Object storage transaction을 Noema-owned repository adapter 뒤에 사용한다. plan/checkpoint admission은 기존 pure domain code에 남고, storage adapter는 atomic claim, exact claim completion, effect-start evidence, checkpoint CAS, cancellation과 recovery만 소유한다.

선택한 `admission_order` 정책은 implicit array order가 아니라 `workflow-execution-policy.v1`로 durable state에 기록한다. pure/idempotent interrupted work의 자동 recovery 횟수를 제한해 앞선 task의 반복 crash가 independent work를 영구 starvation시키지 못하게 하고, side-effecting work는 transport/crash만으로 replay하지 않는다. cancellation은 새 claim을 막고 pending task를 terminal cancelled로 만들되 이미 running인 claim을 지우지 않아 실제 외부 effect 결과 또는 compensation/approval을 기록할 권위를 보존한다.

ADR-0013 candidate와 current #542 source는 runnable candidate, durable claim, explicit effect start, terminal/recovery state, checkpoint commit을 서로 다른 authority transition으로 기록한다. transition receipt에는 task/claim/attempt/cancellation identity, resulting state, checkpoint sequence/digest만 두고 prompt/tool payload/provider credential/foreign domain truth/security verdict를 저장하지 않는다. retained receipt 수는 bounded이고 monotonic transition sequence는 truncation 이후에도 계속되어 history가 잘렸음을 감지할 수 있다.

남은 위험은 이 API를 실제 production scheduler composition이 올바른 순서로 사용하는지, real Durable Object transaction/restart 환경에서도 같은 원자성·recovery 계약이 유지되는지, 그리고 exact-head hosted gates와 canonical documentation graph가 함께 수렴하는지다. 이 항목들이 검증되기 전 #541 또는 #542를 완료로 표시하지 않는다.

## Documentation contradictions

과거 PR 번호, 당시 head SHA, check 결과는 historical provenance다. source grant는 이제 protected truth이므로 과거의 “PR #530 candidate” 표현은 제거했다. 반대로 #528/#542와 Context Fabric Draft는 protected/released truth가 아니다. Canonical PRD/TRD/ADR/UML/OPERABILITY/CHANGELOG가 이 구분과 달라지면 같은 implementation lane에서 교정한다.

## Completion discipline

각 gap은 표의 authoritative completion evidence가 실제로 존재하고 같은 current source/head 또는 명시된 외부 authority에 결합될 때만 닫는다. queued/pending/skipped/cancelled/stale check, predecessor result, 문서 존재, synthetic fixture, model judgement 또는 mutable dependency head는 완료 증거가 아니다. Noema source license, npm/package publication metadata, third-party dependency license, Context Graph release, EA projection, runtime deployment와 buyer/legal evidence는 서로 다른 권위로 유지한다.
