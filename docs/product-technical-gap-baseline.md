# Noema Product and Technical Gap Baseline

## Authority and update rule

이 문서는 제품 요구, protected 구현, active candidate, 검증, 운영 증거 사이의 현재 차이를 추적한다. 저장소 파일과 테스트는 해당 revision의 구현만 증명하며, PR 상태는 exact head와 independently resolved live base에서 다시 확인한다. 운영·배포·고객·매출·법적 증거는 해당 외부 권한이 실제로 남긴 증거만 인정한다. 문서, 성공 boolean, predecessor run, model judgement로 이후 단계의 권위를 만들지 않는다.

이 baseline의 protected-source snapshot은 `main@bbee33270b496255d785c766fc009a5f9162a695`이다. 이 commit은 #528의 runtime bounded-context foundation을 protected history에 통합한 현재 protected tip이다. Active PR의 구현과 transient workflow 상태는 별도 candidate/observation이며 protected truth로 승격하지 않는다.

## Live observation — 2026-09-04 KST

| Authority | Observation | Consequence |
| --- | --- | --- |
| Protected source | `main@bbee33270b496255d785c766fc009a5f9162a695`; #528 merged | Agent Runtime lifecycle, checkpoint admission, bounded task-plan admission/runnable selection은 protected foundation이다. Durable atomic claim/checkpoint persistence는 별도 후속이다. |
| Apache-2.0 source grant | protected main | #530은 이미 merge되었고 root `LICENSE`가 Apache License 2.0이다. source grant integration 자체는 더 이상 open gap이 아니다. |
| Third-party/tooling licensing | issue #531 / PR #540 | Wrangler/Miniflare/Sharp/Libvips GPL-family 개발·빌드 경로 제거 candidate가 진행 중이나 current PR lockfile은 아직 재생성·검증 전이므로 gap은 열려 있다. |
| Durable workflow authority | issue #541 / PR #542 | atomic task claim, checkpoint CAS, effect-start/recovery persistence candidate가 Draft에 있다. protected #528의 pure candidate selector는 durable execution authority를 대신하지 않는다. |
| Reviewer semantic evidence | PR #546 | CodeGraph가 `No relevant code found`, 빈 final explore, marker spoof, annotation-only truncation을 semantic GREEN으로 오인하는 fail-open class의 owner repair가 Draft에 있다. current exact-head required runs가 terminal clean하기 전에는 protected reviewer authority가 아니다. |
| Context Fabric consumer boundary | PR #544 | Noema가 future immutable Context Graph release에 source-bound attestation과 envelope-preserving admission capability를 요구하는 candidate다. mutable producer PR은 authority가 아니다. |
| Release/publication | repository release collection empty | immutable Noema release, package/image publication, release provenance와 rollback evidence는 아직 존재하지 않는다. |

## Current baseline

| Requirement family | Canonical decision / boundary | Protected or active implementation surface | Executable proof | Residual evidence | Maturity |
| --- | --- | --- | --- | --- | --- |
| Credential exchange and readiness | Worker trust contract와 runtime threat model | protected `src/index.ts`, `src/worker.ts`, `src/entrypoint.ts`, `src/runtime-entrypoint.ts`, OIDC/replay/rate-limit modules | typecheck, runtime/API/security tests, exact coverage | protected deployment smoke와 실제 binding/storage operational evidence | Implemented on protected main; operational evidence separate |
| Reviewer and maintenance control plane | 독립 identity, exact-head evidence, deterministic fail-closed gates | protected reviewer/maintenance source plus active PR #546 reviewer-semantic repair | reviewer/workflow contract tests and exact-head workflows | #546 protected integration 후 기존 false-green head의 reviewer evidence 재생성; Maintainer/Reviewer App external activation | Source implemented; reviewer evidence integrity repair active |
| Agent Runtime | ADR 0012 + Context Map | protected execution lifecycle from #528 | lifecycle/cancellation/idempotency/hostile input tests | broader runtime composition and recovery slices | Protected foundation |
| Workflow / Task Execution | task-plan admission과 durable authority 분리 | protected `src/workflow-task-execution/task-plan.ts`; issue #541 / PR #542 durable state-store candidate | protected DAG/concurrency/runnable tests; candidate atomicity/recovery tests on #542 | unchanged exact-head GREEN + protected integration of atomic claim/checkpoint/recovery | Protected pure foundation; durable execution candidate |
| State / Checkpoint | monotonic same-execution admission, exact replay idempotency, CAS at persistence boundary | protected checkpoint admission; PR #542 durable CAS candidate | protected admission tests; candidate storage atomicity/recovery tests | durable persistence current-head GREEN and protected merge | Protected admission; persistence candidate |
| Tool / Capability Boundary | least authority, explicit versioned capabilities, foreign owner ACL | bounded protected capability patterns; issue #545 future external-extension admission | capability/path/credential hostile tests where implemented | product-scoped extension admission/activation/expiry/rollback implementation after #541/#542 | Partial; future product slice remains |
| Context Fabric consumer | immutable released producer contract only; no source copy/cross-service SQL | protected fail-closed boundary + PR #544 strengthened release evidence | ACL/conformance/admission regressions | immutable `context-graph-contracts` release and authenticated Noema trust anchor | Candidate strengthening; foreign release prerequisite open |
| contextual-orchestrator consumer | CO owns model/provider discovery/routing/failover/credentials | protected gateway boundary; PR #535 converges model authority to `orchestrator/free` | gateway/provider-boundary regressions and exact-head workflows | PR #535 exact-head terminal GREEN + protected integration | Protected boundary; routing-alias repair candidate |
| Patch-validator supply chain | exact source/image/receipt binding과 fail-closed vulnerability policy | protected image/runtime/supply-chain implementation | build/runtime/no-network/read-only/non-root/SBOM/vulnerability/receipt tests | protected-main operational receipt and immutable registry publication/signing/attestation | Implemented source; operational/publication evidence incomplete |
| Apache-2.0 source grant | protected main | root `LICENSE`, README/licensing docs integrated through #530 | repository/doc/acquisition licensing contracts | artifact/package rights remain separate evidence when publication occurs | Apache-2.0 protected truth |
| Third-party/tooling licensing | GPL/LGPL/AGPL path not accepted as normal inbound baseline | issue #531 / PR #540 | exact lockfile/license inventory + Worker dev/deploy/typecheck/tests/security | canonical lock regeneration and exact-head terminal verification | Open compliance gap |
| Release and deployment | source → artifact/SBOM/provenance → immutable publication → deployment/rollback | release/deployment/readiness scripts | exact-source/reproducibility/receipt/rollback contract tests | immutable release, governed production deployment, recovery smoke | Incomplete; no release currently exists |
| KPI, customer and acquisition | authentic evidence keeps source/time/buyer/legal authority | KPI/acquisition manifest/integrity/readiness validators | bounded provenance/integrity/fail-closed tests | authentic >=30-day production KPI, customer/revenue, owner/legal transfer evidence | Incomplete; commercial final gate must remain not-ready |

## Reviewer-evidence convergence

Several unchanged product heads have application/security/image workflow successes but their historical `reviewer-ci` result was produced under the confirmed semantic false-green contract. In particular #526, #533, #537 and #543 must not inherit that reviewer success. #546 is the canonical owner repair. It must first reach protected truth with its own unchanged exact-head terminal evidence; affected product heads then require fresh reviewer execution under that protected gate. Source churn merely to trigger a runner, predecessor evidence transfer, self-approval, or gate weakening is not completion.

## Prioritized residual gaps

| Priority | Gap | Buyer/operator impact | Current owner | Authoritative completion evidence | Next executable action |
| --- | --- | --- | --- | --- | --- |
| P0 | Reviewer semantic false-green | review workflow `success`가 실제 semantic code evidence 없이 merge evidence로 오인될 수 있다 | PR #546 | unchanged exact-head CI/reviewer/Security/image/SBOM/vulnerability/provenance terminal clean + protected merge; then fresh affected-head reviewer evidence | #546 current exact-head execution을 보호하고 terminal evidence를 재확인한다 |
| P0 | Atomic durable workflow execution authority | pure runnable selector만으로 concurrent execution/side-effect/checkpoint authority를 안전하게 부여할 수 없다 | issue #541 / PR #542 | atomic single-winner claim, checkpoint CAS, effect-start/recovery/cancellation tests + unchanged exact-head gates + protected merge | #542의 unresolved source-repaired finding을 executable GREEN으로 확인하고 protected path로 통합한다 |
| P0 | GPL-family development/build dependency path | 상업용 inbound dependency 정책과 현재 npm toolchain이 충돌한다 | issue #531 / PR #540 | regenerated exact lockfile에서 GPL/LGPL/AGPL path 제거 + npm ci/typecheck/tests/security/dev/deploy/license inventory terminal clean | pinned Node/npm으로 lockfile reproducibility lane을 완료하고 current head를 검증한다 |
| P0 | Maintainer/Reviewer App and publication identity activation | 자동 유지보수·독립 review·publication capability의 실제 외부 identity 증거가 없다 | issues #29 / #227 | live App installation/permission/key custody/rotation plus successful bounded publication/rollback receipt | 외부 owner가 identity를 provision한 뒤 protected preflight/canary를 실행한다 |
| P0 | Protected `main` governance target | source 검사만으로 실제 merge/release 정책을 만들 수 없다 | issue #27 | fresh live ruleset/protection and behavioral proof | authorized control plane에서 gap을 검증·수정한다 |
| P1 | Context Graph immutable producer contract | runtime evidence projection이 mutable producer source에 기대면 buyer/audit authority가 흔들린다 | PR #544 + producer owner | immutable producer release with package/SBOM/provenance/source-manifest/attestation/conformance/admission evidence and authenticated Noema trust anchor | producer release 전에는 fail closed; #544 current candidate를 exact-head 검증한다 |
| P1 | Patch-validator operational/publication proof | protected source image가 실제 publication/activation됐는지 증명되지 않는다 | issue #66 | protected-main workflow receipt, immutable digest, signature/attestation, activation/rollback proof | exact protected source에서 owner-controlled operational/publication path를 실행한다 |
| P1 | Authentic >=30-day KPI | 성능·신뢰성을 fixture가 아닌 실운영 자료로 입증하지 못한다 | issue #3 | production-origin >=30-day integrity/provenance-bound KPI evidence | governed production source collector/verifier를 실행한다 |
| P1 | Immutable release/deployment/acquisition evidence | buyer/legal/commercial 단계가 source completion보다 뒤에 남아 있다 | issue #5 | immutable release, governed deployment, customer/revenue/support/rights/transfer evidence | 앞선 evidence family를 순서대로 충족하고 acquisition audit을 재실행한다 |

## Documentation contradictions repaired by current candidate

Protected `main@bbee33270b496255d785c766fc009a5f9162a695`에는 #528이 이미 merge되어 있으므로 PRD/Context Map/ADR가 그 구현을 “PR #528 candidate truth”라고 쓰면 authority가 역전된다. 또한 #530은 이미 merged되어 root Apache-2.0 source grant가 protected truth인데, 이전 baseline은 #530을 open candidate로 남겨 두었다. 현재 documentation-repair candidate는 이 두 stale 상태를 제거하면서 ADR 0012 자체는 repository-wide acceptance가 끝나지 않았으므로 `Proposed`를 유지한다. Protected implementation status와 ADR lifecycle을 서로 대체하지 않는다.

## Completion discipline

각 gap은 표의 authoritative completion evidence가 실제로 존재하고 현재 exact source/head에 결합될 때만 닫는다. queued/skipped/cancelled/stale check, predecessor-head 결과, 문서 존재, synthetic fixture, model judgement, mutable sibling source는 완료 증거가 아니다. 한 lane의 runner/review wait은 다른 안전한 Noema-owned repair를 막지 않는다. Source license, package/artifact license metadata, third-party dependency terms, immutable publication, deployment, commercial/legal authority는 서로 별도 evidence class로 유지한다.
