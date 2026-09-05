# Noema Product and Technical Gap Baseline

## Authority and update rule

이 문서는 제품 요구, protected 구현, active candidate, 검증, 운영 증거 사이의 현재 차이를 추적한다. 저장소 파일과 테스트는 해당 revision의 구현만 증명하며 PR 상태는 exact head와 independently resolved live base에서 다시 확인한다. 운영·배포·고객·매출·법적 증거는 해당 외부 권한이 실제로 남긴 증거만 인정한다. 문서, 성공 boolean, predecessor run, model judgement로 이후 단계의 권위를 만들지 않는다.

Protected-source snapshot은 `main@e1ac9d50f6c646f04be8c137c8acdc7200182fcd`이다. #528 runtime bounded-context foundation, #530 Apache-2.0 source grant, #537 GitHub installation-token stateless-format regression은 protected truth다. Active PR 구현과 transient workflow 상태는 candidate/observation이며 protected truth로 승격하지 않는다.

## Live observation — 2026-09-05 KST

| Authority | Observation | Consequence |
| --- | --- | --- |
| Protected source | `main@e1ac9d50f6c646f04be8c137c8acdc7200182fcd` | Agent Runtime lifecycle, checkpoint admission, bounded task-plan admission/runnable selection은 protected foundation이다. Durable atomic claim/checkpoint persistence는 별도 후속 candidate다. |
| Third-party/tooling licensing | issue #531 / PR #540 exact `cfe98c8a5bddfd3275b97b7c2a0372f71aadd55f` | GPL-family 개발·빌드 경로 제거 candidate는 regenerated lockfile/policy와 application CI, reviewer-ci, Security Scan, image terminal success까지 도달했다. reviewer success는 #546 protected integration 이전 semantic contract에서 생성돼 merge-authoritative semantic GREEN으로 승계하지 않는다. |
| Durable workflow authority | issue #541 / PR #542 | atomic task claim, checkpoint CAS, effect-start/recovery persistence candidate가 Draft다. protected pure selector는 durable execution authority를 대신하지 않는다. |
| Reviewer semantic evidence | PR #546 exact `5eee2566d628159113b75741f1914dee824a6545` | Empty/marker/partial-scope/partial-symbol-map, checkout provenance, exact Git path identity와 cross-runtime scope-count 불일치를 fail closed하도록 repair했다. Sandbox는 `Array.from(rawPath).length`로 Python reviewer와 동일한 80 files / 24,079 Unicode-code-point aggregate contract를 사용한다. Exact-head CI/reviewer/Security/image는 non-terminal이다. |
| Stacked reviewer consumers | PR #533 exact `5e992dc7202f01ab99d7135822f3e5b5d49c9fc3`; PR #548 exact `0a039bfeab3b195cdfe921431fef18e79d1cb173` | 두 lane은 #546 `5eee2566...`를 ordinary two-parent/non-force ancestry로 완전 승계하고 각각 runner-assignment domain delta와 actionable failed-check mapping delta만 유지한다. Fresh compare는 각각 59/73 ahead, 0 behind, merge-base exact #546이다. Current workflows는 non-terminal이고 stacked heads의 required Security Scan은 아직 materialize되지 않았다. |
| Context Fabric consumer boundary | PR #544 | Noema는 immutable released Context Graph contract와 authenticated source-bound attestation만 소비한다. Mutable producer PR/source copy/cross-service SQL은 authority가 아니다. |
| Central workflow trust source | `.github/main@7fcada597d5b79bdb14445f24322b2c9f6ed4b19`; PR #527 exact `85d56f277eccdbab618de57e0fdc3fe38398cc2b` | OIDC `job_workflow_sha`는 complete protected central source commit과 exact equality를 요구한다. Central #1914 merge는 governance/documentation knowledge를 갱신했지만 `noema-review.yml` blob `21ea9672...`, `noema_review_gate.py` `5ab7e830...`, `security-scan.yml` `500e22b4...`는 동일하다. #527은 RED `014ce75d...` → production `85d56f27...`로 pin을 갱신했다. |
| Release/publication | repository release collection empty | Immutable Noema release, package/image publication, release provenance와 rollback evidence는 아직 없다. |

## Current baseline

| Requirement family | Canonical boundary | Protected or active surface | Residual evidence | Maturity |
| --- | --- | --- | --- | --- |
| Credential exchange/readiness | Worker trust contract, OIDC/replay/rate-limit | protected runtime entrypoints/modules | protected deployment smoke와 실제 binding/storage operational evidence | Protected source implemented; operations separate |
| GitHub installation-token compatibility | GitHub token은 opaque bounded transport | protected admission + #537 regression | live App exchange/rotation evidence | Protected transport compatibility |
| Reviewer/maintenance control plane | independent identity, exact-head semantic evidence, deterministic fail-closed gates | protected reviewer source + #546 repair | #546 unchanged exact-head terminal GREEN + protected integration; affected heads fresh semantic review; external App activation | Evidence-integrity repair active |
| Agent Runtime | ADR 0012 + Context Map | protected #528 lifecycle foundation | broader runtime composition/recovery slices | Protected foundation |
| Workflow / Task Execution | task-plan admission과 durable authority 분리 | protected task-plan + #542 durable candidate | atomic claim/checkpoint/recovery exact-head GREEN + protected merge | Durable execution candidate |
| State / Checkpoint | monotonic admission, exact replay idempotency, persistence CAS | protected admission + #542 CAS candidate | durable persistence current-head GREEN and merge | Persistence candidate |
| Tool / Capability Boundary | least authority, versioned capabilities, foreign-owner ACL | bounded protected patterns; issue #545 future extension | extension admission/activation/expiry/rollback | Partial |
| Context Fabric consumer | immutable released producer contract only | protected fail-closed boundary + #544 | immutable producer release + authenticated Noema trust anchor | Foreign release prerequisite open |
| contextual-orchestrator consumer | CO owns provider/model discovery/routing/retry/failover/credentials | protected gateway + #535 `orchestrator/free` convergence | #535 exact-head terminal GREEN + protected integration | Routing-alias repair candidate |
| Patch-validator supply chain | exact source/image/receipt, fail-closed vulnerability policy | protected image/runtime/supply-chain implementation | immutable publication/signing/attestation + operational receipt | Source implemented; publication open |
| Source/dependency licensing | Apache-2.0 source grant; third-party terms independent | protected LICENSE + #540 toolchain candidate | protected lockfile/license re-audit and merge | Source grant protected; toolchain replacement candidate |
| Release/deployment | source → SBOM/provenance → immutable publication → deployment/rollback | release/deployment/readiness scripts | immutable release, governed deployment, recovery smoke | Incomplete |
| KPI/customer/acquisition | authentic source/time/buyer/legal authority | KPI/acquisition validators | >=30-day production KPI, customer/revenue, owner/legal transfer evidence | Commercial final gate not-ready |

## Reviewer-evidence convergence

#546 is the canonical owner repair for semantic CodeGraph admission and current-head retrieval provenance. RED `4b96b40bf0f3e0590b1bf99f3879418c009213ff` proves the old JavaScript sandbox could reject a supplementary-plane path inventory that Python admitted because `String.length` counts UTF-16 code units. Production `5eee2566d628159113b75741f1914dee824a6545` counts Unicode code points with `Array.from(rawPath).length`, preserves exact path text, and does not expand the canonical 24,079-character budget.

#533 and #548 are non-force stacked on exact #546. Their exact heads are `5e992dc7202f01ab99d7135822f3e5b5d49c9fc3` and `0a039bfeab3b195cdfe921431fef18e79d1cb173`; fresh compare is 59/73 ahead, 0 behind, merge-base exact #546. Their current workflows are non-terminal and inherit no GREEN authority.

Terminal reviewer successes created before #546 reaches protected truth remain workflow-surface evidence only. This applies to unchanged open heads such as #526, #536, #539, #540 and #543 even where application/Security/image are terminal success. Source churn merely to retrigger review, predecessor evidence transfer, self-approval, force-push/destructive rebase, or gate weakening is not completion.

## Prioritized residual gaps

| Priority | Gap | Current owner | Authoritative completion evidence | Next executable action |
| --- | --- | --- | --- | --- |
| P0 | Reviewer semantic/provenance false-green | PR #546 | unchanged exact-head CI/reviewer/Security/image/SBOM/vulnerability/provenance terminal clean + zero findings + protected merge; then fresh affected-head reviewer evidence | verify #546 exact `5eee2566...`; RCA any terminal failure |
| P0 | Atomic durable workflow execution authority | issue #541 / PR #542 | atomic single-winner claim, checkpoint CAS, effect-start/recovery/cancellation tests + exact-head gates + protected merge | verify #542 repaired head without gate weakening |
| P0 | GPL-family development/build dependency path | issue #531 / PR #540 | regenerated lockfile free of prohibited path + application/security/dev/deploy/license inventory + protected merge | after #546 protected integration, regenerate semantic review for unchanged #540 |
| P0 | Maintainer/Reviewer App activation | issues #29 / #227 | live installation/permissions/key custody/rotation + bounded publication/rollback receipt | owner provision then protected preflight/canary |
| P0 | Protected `main` governance target | issue #27 | fresh ruleset/protection + behavioral proof | authorized control-plane verification/repair |
| P1 | Context Graph immutable producer contract | PR #544 + producer owner | immutable package/SBOM/provenance/source-manifest/attestation/conformance/admission evidence | fail closed until producer release; verify #544 candidate |
| P1 | Patch-validator publication proof | issue #66 | protected workflow receipt, immutable digest, signature/attestation, activation/rollback proof | owner-controlled publication path |
| P1 | Authentic >=30-day KPI | issue #3 | production-origin integrity/provenance-bound KPI | governed collector/verifier |
| P1 | Immutable release/deployment/acquisition evidence | issue #5 | immutable release + governed deployment + customer/revenue/support/rights/transfer evidence | complete preceding evidence families then re-audit |

## Documentation authority reconciliation

Protected `main@e1ac9d50f6c646f04be8c137c8acdc7200182fcd` already contains #528, #530 and #537. Current candidate/observation authority is #546 `5eee2566...`, stacked #533 `5e992dc7...` / #548 `0a039bfe...`, #540 workflow observation, central `.github/main@7fcada59...`, #527 `85d56f27...`, and the empty release collection. ADR 0012 remains `Proposed`; protected implementation status does not imply ADR lifecycle acceptance.

## Completion discipline

A gap closes only when its authoritative completion evidence exists and is bound to the current exact source/head. Queued/skipped/cancelled/stale checks, predecessor results, documentation existence, synthetic fixtures, model judgement and mutable sibling source are not completion evidence. A waiting lane does not block other safe Noema-owned repairs. Source license, package/artifact license metadata, third-party terms, immutable publication, deployment and commercial/legal authority remain separate evidence classes.
