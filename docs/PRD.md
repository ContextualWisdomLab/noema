# Noema Product Requirements Document

## Status

**Proposed canonical PRD.** 이 문서는 PR #71에서 검토 중이며 protected `main`에 병합되기 전에는 운영 상태를 변경하지 않습니다. Noema의 제품 요구사항, 권한 경계, 독립 실행성과 CWL MSA 결합, 자동화의 역할을 한 곳에서 추적하기 위한 기준선입니다.

Noema는 단순한 LLM review bot이 아닙니다. Noema의 제품 경계는 **검증된 GitHub Actions 신원을 repository-scoped GitHub App capability로 교환하고, 그 capability를 사용하는 review/evidence/maintenance control plane이 서로의 권한을 침범하지 않도록 증거와 authority를 분리하는 서비스**입니다.

## 1. 사용자와 이해관계자

### Primary users

- **Repository maintainer**: 정확한 PR revision에 리뷰와 CI evidence를 결합하고 보호규칙을 통과한 변경만 병합해야 합니다.
- **Security / platform operator**: GitHub App, OIDC, Cloudflare Worker, workflow source, Durable Object 상태와 credential scope를 검증하고 롤백할 수 있어야 합니다.
- **CWL service owner**: `.github`, `contextual-orchestrator`, `naruon` 또는 다른 서비스에서 Noema를 protocol-level module로 사용할 수 있어야 합니다.

### Secondary users

- **Independent reviewer**: 모델 판단이나 commit status가 아닌 적격 GitHub review identity와 exact revision을 확인해야 합니다.
- **Acquisition / due-diligence reviewer**: 구현, 보안, release, deployment, 운영·매출·이전 evidence가 섞이지 않은 상태로 검증 가능해야 합니다.
- **Developer / coding agent**: beginner-readable 문서와 테스트를 통해 trust boundary를 역추적 없이 이해하고 안전하게 변경해야 합니다.

## 2. 해결해야 하는 문제

1. GitHub Actions가 reviewer 또는 maintainer 권한을 직접 장기 보유하면 workflow compromise의 blast radius가 커집니다.
2. moving branch/ref, stale PR head, synthetic merge revision, predecessor-head check를 current-head evidence로 오인하기 쉽습니다.
3. check run, commit status, review comment, model verdict가 모두 “green”처럼 보일 수 있으나 의미와 권한이 다릅니다.
4. 모델 실행과 repository write credential이 같은 실행환경에 있으면 untrusted source/model output이 쓰기 권한과 결합됩니다.
5. queue, rate limit, provider cooldown, pending checks 또는 approval latency 때문에 자동 개발이 한 항목에서 멈추면 상용화 속도가 낮아집니다.
6. PR body와 대화에만 설계가 남으면 인수 실사, 신규 운영자, 후속 agent가 현재 architecture를 재구성해야 합니다.

## 3. 제품 원칙

- **Least privilege**: credential은 역할·repository·수명에 맞춰 최소 권한으로 발급합니다.
- **Exact revision before authority**: current immutable source identity가 없는 evidence는 authority로 승격하지 않습니다.
- **Evidence is not authority**: check, status, scanner, review, model judgement, merge, release, deployment를 별도 plane으로 유지합니다.
- **Fail closed**: identity, pagination, binding, state, permission 또는 evidence가 불완전하면 허용으로 추론하지 않습니다.
- **Standalone first, composable second**: Noema는 독립 Worker로 동작하고 CWL 서비스와는 versioned protocol로 결합합니다.
- **Work conserving**: 기다림이나 하나의 blocker는 해당 작업만 defer하며 다른 안전한 작업을 계속합니다.
- **No self-repair privilege escalation**: 임시 repair workflow, self-modifying Action, branch-patching workflow로 정상 쓰기 경로를 대체하지 않습니다.
- **Evidence-backed claims**: production, customer, revenue, transfer, release 또는 certification evidence를 문서만으로 만들어내지 않습니다.

## 4. 제품 모드

### 4.1 Credential exchange mode

`/health`, `/ready`, `/exchange`를 제공하는 Cloudflare Worker가 GitHub Actions OIDC 신원을 검증하고 target repository에 필요한 installation token을 반환합니다.

### 4.2 Independent review composition mode

중앙 `.github` workflow는 Noema가 교환한 credential과 별도 reviewer App identity를 이용해 bounded review evidence를 게시할 수 있습니다. `contextual-orchestrator`는 model routing을 담당하며 Noema Worker는 특정 upstream model provider key를 직접 소유하지 않습니다.

### 4.3 Commercial-readiness maintenance mode

신뢰된 default-branch workflow가 open PR의 exact-head checks, formal reviews, unresolved threads, statuses, mergeability와 governance를 평가합니다. 실제 write는 별도 Maintainer App capability를 사용해야 하며 활성화 전에 운영 acceptance가 필요합니다.

### 4.4 Product-development proposal mode

PR queue가 비었을 때 OpenCode Agent가 `NVIDIA_NIM_API_KEY`만 사용해 bounded proposal을 만들 수 있습니다. 모델이 실행되는 runner는 repository write credential을 받지 않고, 별도 verifier와 non-executing publisher가 immutable patch를 검증합니다. 이 모드는 review, approval, merge, release, deploy authority를 갖지 않습니다.

### 4.5 Acquisition evidence mode

Noema는 기술·보안·운영·release·deployment·commercial evidence를 data-room manifest와 감사 흐름으로 색인할 수 있습니다. 존재하지 않는 production/customer/revenue evidence는 `NOT_READY`로 남겨야 합니다.

## 5. Functional requirements

| ID | Requirement |
| --- | --- |
| FR-001 | `/health`는 liveness만, `/ready`는 credential-exchange readiness만, `/exchange`는 credential exchange만 담당해야 합니다. |
| FR-002 | OIDC issuer, audience, organization/repository, exact workflow ref와 paired immutable workflow SHA를 검증해야 합니다. |
| FR-003 | reusable workflow에서는 `job_workflow_ref`와 `job_workflow_sha`를 같은 pair로 사용해야 합니다. |
| FR-004 | target repository와 GitHub API/OIDC outbound destination은 검증된 범위 밖으로 확장되지 않아야 합니다. |
| FR-005 | replay protection과 distributed pre-auth rate limiting은 isolate-local state가 아니라 별도 coordinated state를 사용해야 합니다. |
| FR-006 | credential-bearing request/response body, timeout, redirect, origin과 secret/log boundary를 제한해야 합니다. |
| FR-007 | automated PR decision은 exact current head와 independently resolved live base tip을 구분해 다뤄야 합니다. |
| FR-008 | check runs, commit statuses, formal reviews, scanner revision evidence와 model judgement를 서로 대체하지 않아야 합니다. |
| FR-009 | paginated GitHub evidence는 모든 page를 수집하지 못하면 완전하다고 판단하지 않아야 합니다. |
| FR-010 | repository write 직전에 live head/base/ref/blob을 다시 읽고 다른 writer가 이동시킨 경우 해당 branch mutation을 중단해야 합니다. |
| FR-011 | open PR마다 review feedback을 stale/duplicate/incorrect/superseded/current-valid로 분류하고 valid finding만 test-first로 수정해야 합니다. |
| FR-012 | protected merge는 실제 ruleset/branch policy, required checks, unresolved thread, applicable independent approval과 security requirements를 모두 통과해야 합니다. |
| FR-013 | product-development agent는 OpenCode + `NVIDIA_NIM_API_KEY`를 사용하고 Copilot credential을 사용하지 않아야 합니다. |
| FR-014 | model runner, uncredentialed verifier, credential-bearing publisher의 trust domain을 분리해야 합니다. |
| FR-015 | publisher가 만드는 branch/PR은 exact identity와 conditional mutation으로 결합되고 failure cleanup이 다른 actor의 ref를 삭제하지 않아야 합니다. |
| FR-016 | operational/release/acquisition audit는 누락 evidence를 성공으로 합성하지 않아야 합니다. |
| FR-017 | canonical PRD/TRD/Architecture/ADR/UML/ERD/traceability/test/operability 문서가 GitHub에서 discoverable해야 합니다. |
| FR-018 | 자동화는 blocker 하나에서 종료하지 않고 안전한 executable queue를 계속 소비해야 합니다. |

## 6. Non-functional requirements

### Security

- production source는 secret을 ambient process environment에서 읽는 새 패턴을 추가하지 않습니다.
- reviewer, maintainer, model/provider credential은 분리합니다.
- untrusted PR source 또는 model output을 credential-bearing publisher에서 실행하지 않습니다.
- redirect, hostile Unicode/JSON, oversized input, stale identity, replay, SSRF-like egress confusion을 현실적인 회귀 테스트로 검증합니다.

### Reliability

- queue/pending/provider latency는 global stop이 아닌 local defer입니다.
- write는 stale-head/ref refusal과 bounded rollback/cleanup을 가져야 합니다.
- Durable Object alarm/retry는 현재 state를 재검증하여 과거 cleanup이 새 state를 제거하지 않도록 합니다.
- liveness와 readiness를 분리합니다.

### Quality

- owned production statement와 branch coverage는 100%를 유지합니다.
- tooling이 제공하면 function/line coverage도 100%를 유지합니다.
- public API와 reviewer Python surface의 docstring/documentation coverage를 100%로 유지합니다.
- 테스트는 실제 API, workflow, adversarial input, operational failure를 재현해야 합니다.

### Supply chain

- GitHub Actions source는 immutable commit SHA를 사용합니다.
- Node/npm/toolchain 및 lockfile regeneration은 재현 가능한 identity와 change-control을 가져야 합니다.
- release 시 SBOM/provenance/release receipt를 독립적으로 검증할 수 있어야 합니다.

### Accessibility and operability

운영·구매자용 evidence는 사람이 읽을 수 있는 문서와 machine-readable artifact를 함께 제공해야 하며, status만 보고 hidden state를 추측하게 만들지 않아야 합니다.

## 7. CWL interoperability requirements

- `.github`: repository/organization workflow와 review policy plane. Noema의 runtime secret을 복제하지 않습니다.
- `contextual-orchestrator`: model routing/reasoning plane. Noema runtime은 upstream provider key에 직접 종속되지 않습니다.
- `naruon` 및 다른 CWL 서비스: API/OIDC/evidence contract를 통한 consumer. Noema 내부 source import를 강제하지 않습니다.
- 다른 repository에 dedicated writer loop가 있으면 Noema loop는 read-only dependency로 취급합니다.

## 8. Acceptance semantics

어떤 기능의 “완료”도 다음을 구분합니다.

1. code/document implemented on a PR branch;
2. exact-head CI/security/review evidence available;
3. protected merge completed;
4. protected-main operational acceptance completed;
5. versioned release evidence completed;
6. production deployment and environment evidence completed;
7. commercial/acquisition evidence completed.

상위 단계가 하위 단계를 자동으로 의미하지 않습니다.

## Implemented

현재 protected-main 및 이미 존재하는 repository surface에는 다음 계열이 구현되어 있습니다. 세부 구현 상태는 `ARCHITECTURE.md`, `docs/api-spec.md`, `docs/runbook.md`, 각 workflow와 exact-source test를 source of truth로 사용합니다.

- Cloudflare Worker credential exchange와 `/health` contract.
- `/exchange` OIDC/GitHub App 교환, bounded input/egress, distributed rate limit, replay guard 계열.
- central review, commercial-readiness, product-development, readiness/acquisition evidence workflow와 테스트의 상당 부분.
- check/status/review/model evidence 분리를 강제하는 deterministic policy code와 tests.
- 100% configured production coverage gate와 reviewer docstring/coverage gate.

`main`에서 정확히 어떤 revision이 활성인지 여부는 이 문서의 날짜가 아니라 live source와 protected-main evidence로 판정합니다.

## Planned

다음은 active PR/issue에서 구현·통합·검증 중이므로 protected-main 기능으로 과장하지 않습니다.

- PR #71: immutable workflow source SHA와 canonical architecture trust boundary 통합.
- PR #76: `nanoid` advisory의 최소 lockfile remediation과 exact-head CI identity.
- PR #78: repository-wide deterministic Node/npm/lockfile change control.
- PR #80: work-conserving RCA/feasibility scheduler contract와 atomic proposal publisher.
- PR #65/#67: quarantined patch validator와 repository-owned validator image evidence.
- Issue #66: validator image publication/activation boundary.
- Issue #73: private vulnerability reporting의 administrator setting 및 benign process exercise.

각 항목은 해당 PR exact head가 아니라 protected merge 후에만 `Implemented`로 이동합니다.

## External evidence

다음은 repository text나 test만으로 완료할 수 없습니다.

- Issue #27의 enforceable `main` ruleset/branch protection, direct-push/force-push/deletion rejection, reviewed break-glass control.
- Issue #29의 dedicated Maintainer App 설치, exact permission, reviewer identity, secret/variable, activation/rollback evidence.
- protected production environment와 independent environment-review evidence.
- production KPI/provenance, release publication receipt, production deployment/attestation evidence.
- real customer/pilot, revenue/LOI/pipeline, transfer/IP/license/operational ownership evidence.

이 evidence가 없으면 release 또는 acquisition readiness를 문서로 대체하지 않습니다.

## 9. Explicit non-goals

- 모델 output 자체를 GitHub approval로 취급하지 않습니다.
- Copilot token을 autonomous development credential로 사용하지 않습니다.
- PR branch를 고치기 위한 self-modifying/repair workflow를 제품 기능으로 만들지 않습니다.
- repository protection을 자동화 편의를 위해 약화하지 않습니다.
- Noema를 특정 model provider, `naruon` database 또는 다른 서비스의 release lifecycle에 결합하지 않습니다.
- production KPI, customer, revenue, transfer, certification 또는 release proof를 합성하지 않습니다.
- 모든 오류를 retry하면 성공으로 간주하는 repeat-until-green 정책을 사용하지 않습니다.

## 10. Product acceptance checklist

- [ ] canonical documentation graph가 current source와 일치합니다.
- [ ] exact-head/live-base/reviewer/evidence semantics가 executable tests로 고정되어 있습니다.
- [ ] 100% owned production coverage/docstring gates가 current head에서 통과합니다.
- [ ] security and dependency gates가 waiver 없이 통과합니다.
- [ ] protected ruleset과 independent review policy가 실제 GitHub에서 검증됩니다.
- [ ] maintainer/reviewer/model identities와 credentials가 role-separated 상태로 operationally proven됩니다.
- [ ] release/deployment를 수행할 경우 provenance/SBOM/rollback/recovery가 같은 exact source에 결합됩니다.
- [ ] acquisition claim을 할 경우 external commercial/transfer evidence가 검증됩니다.

## 11. Related authoritative documents

- `ARCHITECTURE.md` — runtime, trust, MSA, authority planes.
- `docs/TRD.md` — 기술 요구사항과 exact evidence semantics.
- `docs/UML.md` — component/sequence/state/deployment views.
- `docs/ERD.md` — persisted state와 conceptual evidence model의 구분.
- `docs/TRACEABILITY.md` — requirement → source/test/ADR/evidence mapping.
- `docs/TEST_STRATEGY.md` — realistic validation and coverage policy.
- `docs/OPERABILITY.md` — activation, SLO/evidence, incident/rollback operations.
- `docs/threat-model.md` — runtime threat analysis.
- `docs/doctoring/architecture-trust-boundaries.md` — primary-source/standard rationale and APA 7 references.
