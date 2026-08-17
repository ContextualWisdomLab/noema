# Doctoring: Architecture and trust-boundary basis

검토 기준일: **2026-08-07**

이 문서는 `ARCHITECTURE.md`의 보안·공급망·분산상태 설계 판단에 사용한 권위 있는 근거를 기록합니다. Normative requirement를 설명할 때는 finalized standard를 우선하며, draft는 향후 변화 감시 용도로만 사용합니다.

## 1. Secure software development와 acquisition evidence

Noema는 NIST Secure Software Development Framework(SSDF)의 outcome-oriented 접근을 repository 정책에 적용합니다. 현재 finalized normative 기준은 **NIST SP 800-218, SSDF Version 1.1**입니다. NIST는 SSDF가 취약점 감소뿐 아니라 소프트웨어 생산자와 구매자 사이의 조달·관리 커뮤니케이션에 공통 언어를 제공한다고 설명합니다. 따라서 Noema의 architecture 문서는 구현도뿐 아니라 검토, 공급망, 운영 evidence와 authority의 분리를 buyer-facing contract로 명시합니다.

NIST는 **SP 800-218 Rev. 1 / SSDF Version 1.2**를 2025-12-17 initial public draft로 공개했으며 2026-08-07 현재 finalized replacement가 아닙니다. 이 저장소는 Rev. 1 draft의 존재를 추적하되, draft를 final normative requirement처럼 표현하지 않습니다.

적용 결정:

- 개발·검토·배포 security requirement를 문서화하고 변경 시 유지합니다.
- 검사 결과 하나를 release/merge authority로 승격하지 않습니다.
- 실제 production, customer, revenue, transfer evidence가 없으면 acquisition gate를 문서로 대체하지 않습니다.
- 보안 gate를 우회하는 repair workflow보다 원인 수정과 독립 evidence를 우선합니다.

## 2. Source revision, exact-head, review policy

SLSA Version 1.2는 2025-11-24 Approved Specification으로 공개되었고 Source Track을 포함합니다. Source Track은 source revision을 논리적으로 immutable한 snapshot으로 정의하며, Git commit SHA 같은 revision identifier를 예로 듭니다. 또한 Source Control System이 authentication, authorization, mandatory review, status checks 같은 technical control을 강제할 수 있어야 한다는 모델을 제공합니다.

Noema의 `exact-head` 정책은 이 구분을 직접 반영합니다.

- 움직이는 branch 이름은 source revision 자체가 아닙니다.
- PR head SHA가 바뀌면 이전 check/review evidence를 현재 head의 증거로 재사용하지 않습니다.
- repository write 직전 head 재검증은 stale-source publication을 막는 control입니다.
- branch protection/ruleset은 문서상 의도가 아니라 실제 Source Control System enforcement evidence로 검증해야 합니다.

SLSA Build Track의 provenance와 Source Track의 source controls는 서로 다른 보증입니다. Noema가 향후 artifact provenance를 갖더라도 protected review 또는 exact-source evidence를 자동으로 대체하지 않습니다.

## 3. GitHub Actions OIDC workflow-source identity

GitHub의 현재 OIDC reference는 `workflow_ref`와 `workflow_sha`, reusable workflow용 `job_workflow_ref`와 `job_workflow_sha`를 별도 claim으로 제공합니다. GitHub는 `workflow_sha`를 workflow file의 commit SHA로, `job_workflow_sha`를 reusable workflow file의 commit SHA로 정의합니다. 따라서 사람이 읽기 쉬운 ref path만 비교하면 branch 또는 tag가 이동했을 때 권한 경계도 함께 움직일 수 있습니다.

Noema는 다음 두 tuple만 허용합니다.

```text
workflow_ref      + workflow_sha
job_workflow_ref  + job_workflow_sha
```

적용 결정:

- `ALLOWED_WORKFLOW_REF_PREFIX`는 하위 호환을 위한 변수명일 뿐 prefix match를 하지 않고 전체 ref를 정확히 비교합니다.
- `ALLOWED_WORKFLOW_SHA`는 canonical lowercase 40자리 Git SHA여야 하며 `/ready`도 이를 검사합니다.
- reusable workflow claim이 존재하면 `job_workflow_ref`를 `job_workflow_sha`와만 결합합니다.
- caller `workflow_sha`를 reusable `job_workflow_ref`의 증거로 섞거나 그 반대로 혼합하지 않습니다.
- exact ref와 paired SHA 중 하나라도 누락·비정규·불일치하면 credential exchange 전에 실패-폐쇄합니다.
- 중앙 workflow가 의도적으로 변경되면 새 source SHA를 검토하고 Noema 설정을 별도 변경해야 합니다.
- OIDC token은 short-lived authentication evidence이며 merge/release authority 자체가 아닙니다.
- reviewer App, maintainer App, model provider credential은 역할별로 분리합니다.

GitHub는 **2026-07-15 이후 생성된 repository**의 기본 OIDC `sub`에 immutable owner/repository ID를 포함하도록 변경했습니다. 그 이전 repository는 opt-in하지 않으면 기존 형식을 유지할 수 있습니다. 따라서 Noema 문서는 특정 `sub` 형식이 모든 repository에 자동 적용된다고 가정하지 않으며, workflow-source SHA 검증을 default `sub` 형식과 독립된 control로 유지합니다.

## 4. Cloudflare bindings와 secret capability

Cloudflare Workers의 current bindings documentation은 binding을 permission과 API가 결합된 capability로 설명합니다. Worker가 Cloudflare resource를 사용할 때 별도 REST credential을 직접 다루지 않아도 되며, secret binding도 `env`를 통해 request context에 전달할 수 있습니다.

또한 Cloudflare는 binding-only deployment 후 기존 isolate가 재사용될 수 있음을 명시합니다. 따라서 binding-derived 전역 cache는 secret/config rotation 뒤에도 stale value를 보존할 위험이 있습니다. Noema는 request-scoped validation을 기본으로 하고, cache가 필요하면 정확히 불변성이 입증된 좁은 결과만 재사용합니다. `ALLOWED_WORKFLOW_SHA` 같은 non-secret trust binding은 `/ready`와 `/exchange`에서 매 요청 다시 평가합니다.

적용 결정:

- production `src/`에서 `process.env`/`os.getenv()` secret lookup을 추가하지 않습니다.
- Cloudflare `Env`/secret binding을 runtime capability boundary로 취급합니다.
- binding rotation 후 stale global derivative가 authorization decision을 지속하지 않도록 합니다.
- model/provider secret은 Noema Worker의 GitHub App secret과 공유하지 않습니다.

## 5. Durable Objects와 cross-isolate state

Cloudflare는 Durable Object를 globally unique coordination primitive로 설명하고, 각 object에 private persistent storage가 결합된다고 설명합니다. SQLite-backed Durable Object storage는 transactional하고 strongly consistent하며, Cloudflare는 신규 namespace에 SQLite backend 사용을 권장합니다.

Noema의 두 Durable Object는 서로 다른 security invariant를 담당합니다.

- `NoemaRateLimiter`: 여러 Worker isolate 사이에서 pre-auth request budget을 조정합니다.
- `NoemaOidcReplayGuard`: 검증된 OIDC `jti`의 single-use decision을 조정합니다.

이 두 상태를 isolate-local memory cache만으로 구현하면 global coordination을 보장할 수 없습니다. 반대로 모든 상태를 하나의 object에 합치면 failure domain과 data minimization 경계가 넓어집니다. 현재 분리는 목적별 최소 상태와 별도 failure semantics를 유지하기 위한 선택입니다.

## 6. Alarm semantics와 temporal correctness

Cloudflare Durable Object alarm은 **at-least-once**로 실행되며 handler가 uncaught exception을 던지면 2초부터 시작하는 exponential backoff로 자동 재시도됩니다. 현재 공식 계약은 최대 **6회 재시도**입니다. 자동 재시도 횟수가 유한하므로 Cloudflare는 장기적인 재실행이 필요할 때 handler가 예외를 처리하고 새 alarm을 예약하도록 권고합니다.

Noema는 시간 흐름을 state model의 일부로 취급합니다.

- rate-limit cleanup은 현재 저장된 active window deadline을 다시 읽고 expired state만 삭제합니다.
- replay cleanup도 현재 claim/expiry를 재검증한 뒤 삭제 또는 reschedule합니다.
- delayed/retried alarm은 새 상태를 과거 상태로 오인해 제거하면 안 됩니다.
- 자동 재시도 소진만으로 cleanup이 영구 보장된다고 가정하지 않고, 현재 state가 여전히 유효하거나 cleanup 재시도가 필요하면 명시적으로 alarm을 다시 설정합니다.

이는 단순 timer 구현이 아니라 temporal state correctness requirement입니다.

## 7. Evidence planes와 authority planes

Architecture에서 다음을 별도 plane으로 유지하는 것은 공급망 evidence의 의미를 과장하지 않기 위한 control입니다.

1. GitHub **check runs** — workflow/job execution evidence
2. **commit statuses** — integration-provided commit context
3. **review evidence** — reviewer conclusion, thread, comment
4. **model judgement** — LLM output/evaluation evidence
5. **merge authority** — branch/ruleset enforcement와 eligible approval
6. **release authority** — version, package, provenance, release acceptance
7. **deployment authority** — protected production environment와 deployment approval

한 plane의 green state는 다른 plane의 proof가 아닙니다. 특히 status-only `success`, queued/pending run, stale review, model output은 독립 approval이나 protected merge proof로 취급하지 않습니다.

## 8. MSA 및 CWL interoperability

`ContextualWisdomLab/.github`, `contextual-orchestrator`, `naruon` 및 다른 CWL 서비스와의 연결은 **protocol composition**을 우선합니다. Noema의 내부 모듈을 다른 서비스가 직접 import하도록 강제하면 release cadence, secret boundary, failure domain이 결합되기 때문입니다.

- 중앙 `.github`: workflow/review policy plane
- Noema: OIDC-to-GitHub-App credential exchange plane
- `contextual-orchestrator`: model routing/reasoning plane
- `naruon` 및 다른 서비스: consumer/composition plane

각 서비스는 독립 배포와 rollback이 가능해야 하며, 결합 시에는 exact identity와 versioned request/evidence contract를 사용해야 합니다.

## References (APA 7th)

Cloudflare. (n.d.). *Alarms*. Cloudflare Developers. Retrieved August 7, 2026, from https://developers.cloudflare.com/durable-objects/api/alarms/

Cloudflare. (n.d.). *Bindings (env)*. Cloudflare Developers. Retrieved August 7, 2026, from https://developers.cloudflare.com/workers/runtime-apis/bindings/

Cloudflare. (n.d.). *Cloudflare Durable Objects*. Cloudflare Developers. Retrieved August 7, 2026, from https://developers.cloudflare.com/durable-objects/

Cloudflare. (n.d.). *SQLite-backed Durable Object Storage*. Cloudflare Developers. Retrieved August 7, 2026, from https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/

GitHub. (n.d.). *OpenID Connect reference*. GitHub Docs. Retrieved August 7, 2026, from https://docs.github.com/en/actions/reference/security/oidc

SLSA Community. (2025, November 24). *Announcing SLSA v1.2*. https://slsa.dev/blog/2025/11/announce-slsa-v1.2

SLSA Community. (2025). *SLSA specification, version 1.2*. https://slsa.dev/spec/v1.2/

Souppaya, M., Scarfone, K., & Dodson, D. (2022). *Secure Software Development Framework (SSDF) version 1.1: Recommendations for mitigating the risk of software vulnerabilities* (NIST Special Publication 800-218). National Institute of Standards and Technology. https://doi.org/10.6028/NIST.SP.800-218

## Source verification notes

2026-08-07 확인 결과:

- NIST SP 800-218 v1.1은 final이며, SP 800-218 Rev. 1 / SSDF v1.2는 initial public draft 상태입니다.
- SLSA v1.2는 `Status: Approved`입니다.
- GitHub OIDC reference는 `workflow_sha`와 reusable workflow의 `job_workflow_sha`를 각 workflow file의 commit SHA로 정의합니다.
- GitHub OIDC reference는 immutable default subject claim rollout 기준일을 2026-07-15로 명시합니다.
- Cloudflare alarm 문서는 at-least-once execution, 2초부터 시작하는 exponential backoff, 최대 6회 retry, 장기 재시도를 위한 explicit rescheduling 권고를 명시합니다.
- Cloudflare Durable Objects 문서는 SQLite-backed storage의 strongly consistent transactional storage를 명시합니다.