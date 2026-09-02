# Noema Product and Technical Gap Baseline

## Authority and update rule

이 문서는 제품 요구, 구현, 검증, 운영 증거 사이의 현재 차이를 한곳에서 추적한다. 저장소 파일과 테스트는 revision-local 또는 protected-source 구현만 증명한다. PR 상태는 exact head와 live base에서, 운영·배포·고객·매출·법적 증거는 해당 외부 권한에서 각각 다시 확인해야 한다. 문서나 성공 boolean만으로 이후 단계의 증거를 만들지 않는다.

이 baseline은 두 독립 계보의 protected-source snapshot을 병합한다: 이 PR(acquisition/commercial-evidence) 계보는 `main@dd6ff2aa46f8daa8aa9a4e19e0d6825f4a98f383`를, README/license 계보(PR #530/#532)는 `main@5aad3e410703faaf52882e2f33fadd25d217bcdd`를 기준으로 관찰했다. 이 baseline을 병합하는 시점의 protected `main`은 두 계보보다 더 전진해 PR #530(product-first README + Apache-2.0 root source grant)과 PR #532(pinned GitHub-hosted runner selectors)를 이미 포함한 `6b2b3e90dc3d5bd24cd27ed11db41b9eb7106010`이다. issues #3, #5, #27, #29, #66, #227은 2026-09-01 KST에 GitHub에서 모두 `OPEN`으로 다시 확인했고, issue #531(GPL-family 의존성 경로)의 live 상태는 별도로 GitHub 권위에서 다시 읽어야 한다. 상태가 바뀌면 live GitHub를 우선하며 이 표를 갱신하고, protected/main·PR·외부 증거를 서로 대체하지 않는다.

## Live external observation — 2026-09-01 KST

| Authority | Observation | Consequence |
| --- | --- | --- |
| Pull requests | 이 PR 계보의 2026-09-01 KST 스냅샷 기준 #510, #521, #524, #526, #527이 open이었다. #510의 Application·reviewer-ci·Security Scan은 terminal-success이나 image gate가 `in_progress`였고, #521/#524/#526/#527에는 당시 exact-head queued/pending gate가 남아 있었다 | 그 스냅샷 시점에는 merge-authoritative한 open PR이 없었고 zero-PR hourly activation canary도 실행되지 않았다; live 상태는 GitHub에서 다시 확인해야 한다 |
| Hourly product development | 최근 관찰된 scheduled run은 open-PR single-flight gate에서 후속 proposal/publication 단계를 실행하지 않았다 | retired direct-provider/NVIDIA run을 현재 상태로 사용하지 않으며, zero-PR 이후 `contextual-orchestrator` canary가 필요하다 |
| README/license lane | PR #530이 product-first README와 Apache-2.0 root source grant를 도입했고, 이 baseline을 병합하는 시점 기준 protected `main@6b2b3e90...`에 이미 병합되어 protected truth가 되었다 | protected main은 이제 명시적 outbound source license를 갖는다; 남은 gap은 dependency licensing(#531)과 third-party toolchain 정합이다 |
| npm package boundary | `package.json`은 `private`로 유지되고 npm package는 product distribution channel이 아니며 package-publication license field는 도입되지 않았다 | root `LICENSE`가 source rights를 통제하고 무관한 lockfile metadata churn을 강제하지 않는다 |
| Dependency licensing | `package-lock.json`에 `wrangler → miniflare → sharp → @img/sharp-libvips-*` 경로의 `LGPL-3.0-or-later` optional dev/build 패키지가 남아 있다; issue #531이 제거/교체를 owns한다 | source Apache-2.0만으로는 현재 toolchain이 조직의 no-GPL-family 기본 정책을 충족하지 못한다 |
| Release/publication | GitHub release, protected-main patch-validator workflow-dispatch receipt, immutable release/deployment/customer/revenue/transfer evidence가 모두 없다 | source licensing 통합만으로는 acquisition readiness로 승격되지 않으며, publication, signing, deployment, KPI, acquisition evidence는 계속 미완료다 |

## Current baseline

| Requirement family | Canonical decision / boundary | Protected or active implementation surface | Executable proof | Residual evidence | Maturity |
| --- | --- | --- | --- | --- | --- |
| Credential exchange and readiness | Worker trust contract와 runtime threat model | `src/index.ts`, `src/worker.ts`, `src/entrypoint.ts`, `src/runtime-entrypoint.ts`, OIDC/replay/rate-limit 모듈 | typecheck, runtime/API/security tests, exact configured coverage | protected deployment smoke와 실제 binding/storage 증거 | Implemented on protected main; operational evidence remains separate |
| Reviewer and maintenance control plane | 독립 App identity, bounded manifest, deterministic fail-closed gates | `reviewer/noema_reviewer/`, maintainer/reviewer workflows, capability-file ingress | reviewer tests, workflow contract tests, current-head review artifacts | Maintainer/Reviewer App 설치·권한·key custody·rotation 및 publication identity | Source contract implemented; external activation evidence is open |
| Hourly product-development loop | `contextual-orchestrator` inference와 별도 Maintainer App publication identity를 사용하는 work-conserving loop | `.github/workflows/hourly-product-development.yml`, orchestrator gateway contract, publication/readiness validators | workflow shape, gateway preflight, lease, publication prerequisite and stale-head refusal tests | zero-PR scheduled proposal publication과 rollback/recovery exercise | Implemented source; production activation incomplete |
| Patch-validator supply chain | exact source/image/receipt binding과 fail-closed vulnerability policy | `Dockerfile.patch-validator`, image workflow, validator/SBOM/receipt modules | build, runtime, smoke, SBOM, vulnerability and receipt tests | protected-main operational receipt와 registry publication/signing/attestation | Implemented source; operational/publication evidence incomplete |
| Source licensing | Noema-owned source uses one explicit commercial-friendly outbound grant; package publication and dependencies retain independent terms | PR #530 `LICENSE`, root `README.md`, `docs/LICENSING_AND_IP_TRANSFER.md`; private `package.json` remains non-distribution metadata | exact-head repository/doc/test consistency | protected integration plus third-party/tooling policy resolution | Apache-2.0 candidate truth on #530; not yet protected truth |
| Third-party/tooling licensing | GPL-family packages are not accepted as the normal inbound dependency baseline | current lockfile + dependency-license inventory + issue #531 | exact lockfile scan/inventory must become free of GPL/LGPL/AGPL toolchain entries | commercially compatible Wrangler/Miniflare/build-tool replacement or exact approved exception | Open compliance gap; source license does not resolve it |
| Release and deployment | source → package/SBOM/provenance → immutable publication → deployment/rollback | release, publication, deployment and readiness scripts | exact-source/reproducibility/receipt/rollback contract tests | immutable release, protected deployment, recovery and production smoke evidence | Incomplete; repository evidence cannot establish deployment |
| KPI, customer and acquisition | authentic evidence must retain source, time and buyer/legal authority | KPI, acquisition manifest/integrity/readiness and license validators; revenue/transfer source documents are retained-byte digest bindings | bounded input, provenance, ordering, source-document byte integrity and fail-closed tests | authentic 30-day production KPI, customer/revenue and transfer authority | Technical integrity is implemented; no commercial-readiness claim from digest equality |

## Prioritized residual gaps

| Priority | Gap | Buyer/operator impact | Current owner | Authoritative completion evidence | Next executable action |
| --- | --- | --- | --- | --- | --- |
| P0 | GPL-family development/build dependency path | 조직의 상업용 inbound 정책과 현재 npm toolchain이 충돌한다 | issue #531 | exact-head `package-lock.json`과 dependency inventory에서 GPL/LGPL/AGPL 경로가 사라지고 Worker dev/deploy·typecheck·tests·security가 그대로 통과 | Wrangler/Miniflare/Sharp 경로를 상업적으로 호환되는 도구 경계로 교체하고 lockfile을 재검증한다 |
| P0 | Maintainer/Reviewer App 및 hourly publication identity 활성화 | 자동 유지보수와 독립 리뷰가 production capability로 동작한다는 증거가 없다 | issues #29 / #227 | 현재 App 설치·권한·key custody/rotation, 성공한 scheduled publication artifact와 rollback 결과 | 외부 App 구성을 완료한 뒤 readiness와 scheduled run을 실행하고 artifact를 보존한다 |
| P0 | protected `main` governance 목표와 live policy 정합성 | source 검증만으로 실제 merge/release 통제를 보장할 수 없다 | issue #27 | live ruleset/branch-protection API와 관찰된 required workflow/status 결과 | governance audit을 live policy에 실행하고 차이를 owning control에서 수정한다 |
| P1 | Apache-2.0 source grant integration | 공개 저장소가 protected main에서는 아직 명시적 사용권을 제공하지 않는다 | PR #530 | unchanged exact-head README/LICENSE + applicable reviews/checks + protected merge | #530 exact head를 정상 protected path로 통합한다 |
| P1 | patch-validator 운영·배포 증거 | 검증된 source image가 실제 배포·서명·활성화됐는지 구매자가 확인할 수 없다 | issue #66 | protected-main operational receipt, registry digest, signature/attestation과 activation proof | exact protected source에서 publication pipeline을 실행한다 |
| P1 | authentic 30-day KPI | 신뢰성·성능·운영가치를 fixture가 아닌 실운영 자료로 입증하지 못한다 | issue #3 | production-origin, time-bound, integrity-checked 30-day KPI evidence | 승인된 production source에서 collector와 verifier를 실행한다 |
| P1 | release/deployment/acquisition evidence | buyer/legal/commercial 권한이 없어 매각 readiness를 선언할 수 없다 | issue #5 | immutable release/deployment/customer/revenue/legal transfer evidence | 앞선 evidence family를 순서대로 충족하고 acquisition audit을 재실행한다 |

## Documentation contradictions

과거 PR 번호와 당시 상태는 historical provenance일 뿐 현재 owner나 구현 상태가 아니다. Canonical TRD와 ADR은 protected implementation surface와 durable live issue owner를 사용하며, historical PR을 current owner로 사용하지 않는다. PR #530의 Apache-2.0 grant도 merge 전에는 protected truth로 표현하지 않는다.

## Completion discipline

각 gap은 표의 authoritative completion evidence가 실제로 존재하고 현재 source/head에 결합될 때만 닫는다. queued/skipped/cancelled/stale check, predecessor-head 결과, 문서 존재, synthetic fixture 또는 model judgement는 완료 증거가 아니다. Noema source의 Apache-2.0 grant, npm package-publication metadata, 제3자 package license evidence는 서로 별도 권위로 유지한다.
