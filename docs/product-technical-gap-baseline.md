# Noema Product and Technical Gap Baseline

## Authority and update rule

이 문서는 제품 요구, 구현, 검증, 운영 증거 사이의 현재 차이를 한곳에서 추적한다. 저장소 파일과 테스트는 revision-local 또는 protected-source 구현만 증명한다. PR 상태는 exact head와 live base에서, 운영·배포·고객·매출·법적 증거는 해당 외부 권한에서 각각 다시 확인해야 한다. 문서나 성공 boolean만으로 이후 단계의 증거를 만들지 않는다.

이 baseline의 source snapshot은 protected `main` `dd6ff2aa46f8daa8aa9a4e19e0d6825f4a98f383`이며, issues #3, #5, #27, #29, #66, #227은 2026-09-01 KST에 GitHub에서 모두 `OPEN`으로 다시 확인했다. 상태가 바뀌면 live GitHub를 우선하며 이 표를 갱신한다.

## Live external observation — 2026-09-01 KST

| Authority | Observation | Consequence |
| --- | --- | --- |
| Pull requests | #510, #521, #524, #526, #527 are open. #510의 Application·reviewer-ci·Security Scan은 terminal-success이나 image gate가 `in_progress`이고, #521/#524/#526/#527에는 현재 exact-head queued/pending gate가 남아 있다. | 현재 어느 open PR도 merge-authoritative 하지 않으며, zero-PR hourly activation canary도 아직 실행할 수 없다 |
| Hourly product development | 최근 관찰된 scheduled run은 open-PR single-flight gate에서 후속 proposal/publication 단계를 실행하지 않았다 | retired direct-provider/NVIDIA run을 현재 상태로 사용하지 않으며, zero-PR 이후 `contextual-orchestrator` canary가 필요하다 |
| Release/publication | GitHub release와 protected-main patch-validator workflow-dispatch receipt가 없다 | immutable publication, signing, deployment, KPI, acquisition evidence는 계속 미완료다 |

## Current baseline

| Requirement family | Canonical decision / boundary | Protected or active implementation surface | Executable proof | Residual evidence | Maturity |
| --- | --- | --- | --- | --- | --- |
| Credential exchange and readiness | Worker trust contract와 runtime threat model | `src/index.ts`, `src/worker.ts`, `src/entrypoint.ts`, `src/runtime-entrypoint.ts`, OIDC/replay/rate-limit 모듈 | typecheck, runtime/API/security tests, exact configured coverage | protected deployment smoke와 실제 binding/storage 증거 | Implemented on protected main; operational evidence remains separate |
| Reviewer and maintenance control plane | 독립 App identity, bounded manifest, deterministic fail-closed gates | `reviewer/noema_reviewer/`, maintainer/reviewer workflows, capability-file ingress | reviewer tests, workflow contract tests, current-head review artifacts | Maintainer/Reviewer App 설치·권한·key custody·rotation 및 publication identity | Source contract implemented; external activation evidence is open |
| Hourly product-development loop | `contextual-orchestrator` inference와 별도 Maintainer App publication identity를 사용하는 work-conserving loop | `.github/workflows/hourly-product-development.yml`, orchestrator gateway contract, publication/readiness validators | workflow shape, gateway preflight, lease, publication prerequisite and stale-head refusal tests | zero-PR scheduled proposal publication과 rollback/recovery exercise | Implemented source; production activation incomplete |
| Patch-validator supply chain | exact source/image/receipt binding과 fail-closed vulnerability policy | `Dockerfile.patch-validator`, image workflow, validator/SBOM/receipt modules | build, runtime, smoke, SBOM, vulnerability and receipt tests | protected-main operational receipt와 registry publication/signing/attestation | Implemented source; operational/publication evidence incomplete |
| Release and deployment | source → package/SBOM/provenance → immutable publication → deployment/rollback | release, publication, deployment and readiness scripts | exact-source/reproducibility/receipt/rollback contract tests | immutable release, protected deployment, recovery and production smoke evidence | Incomplete; repository evidence cannot establish deployment |
| KPI, customer and acquisition | authentic evidence must retain source, time and buyer/legal authority | KPI, acquisition manifest/integrity/readiness and license validators; revenue/transfer source documents are retained-byte digest bindings | bounded input, provenance, ordering, source-document byte integrity and fail-closed tests | authentic 30-day production KPI, customer/revenue and transfer authority | Technical integrity is implemented; no commercial-readiness claim from digest equality |

## Prioritized residual gaps

| Priority | Gap | Buyer/operator impact | Current owner | Authoritative completion evidence | Next executable action |
| --- | --- | --- | --- | --- | --- |
| P0 | Maintainer/Reviewer App 및 hourly publication identity 활성화 | 자동 유지보수와 독립 리뷰가 production capability로 동작한다는 증거가 없다 | issues #29 / #227 | 현재 App 설치·권한·key custody/rotation, 성공한 scheduled publication artifact와 rollback 결과 | 외부 App 구성을 완료한 뒤 readiness와 scheduled run을 실행하고 artifact를 보존한다 |
| P0 | protected `main` governance 목표와 live policy 정합성 | source 검증만으로 실제 merge/release 통제를 보장할 수 없다 | issue #27 | live ruleset/branch-protection API와 관찰된 required workflow/status 결과 | governance audit을 live policy에 실행하고 차이를 owning control에서 수정한다 |
| P1 | patch-validator 운영·배포 증거 | 검증된 source image가 실제 배포·서명·활성화됐는지 구매자가 확인할 수 없다 | issue #66 | protected-main operational receipt, registry digest, signature/attestation과 activation proof | exact protected source에서 publication pipeline을 실행한다 |
| P1 | authentic 30-day KPI | 신뢰성·성능·운영가치를 fixture가 아닌 실운영 자료로 입증하지 못한다 | issue #3 | production-origin, time-bound, integrity-checked 30-day KPI evidence | 승인된 production source에서 collector와 verifier를 실행한다 |
| P1 | release/deployment/acquisition evidence | buyer/legal/commercial 권한이 없어 매각 readiness를 선언할 수 없다 | issue #5 | immutable release/deployment/customer/revenue/legal transfer evidence | 앞선 evidence family를 순서대로 충족하고 acquisition audit을 재실행한다 |

## Documentation contradictions

과거 PR 번호와 당시 상태는 historical provenance일 뿐 현재 owner나 구현 상태가 아니다. Canonical TRD와 ADR은 protected implementation surface와 durable live issue owner를 사용하며, historical PR을 current owner로 사용하지 않는다.

## Completion discipline

각 gap은 표의 authoritative completion evidence가 실제로 존재하고 현재 source/head에 결합될 때만 닫는다. queued/skipped/cancelled/stale check, predecessor-head 결과, 문서 존재, synthetic fixture 또는 model judgement는 완료 증거가 아니다.
