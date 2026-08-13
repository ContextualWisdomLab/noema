# Hourly Commercial-Readiness Loop

Noema의 `.github/workflows/hourly-commercial-readiness.yml`은 매시간 열린 pull request를 확인하고, 현재 head에 묶인 검증이 모두 충족된 경우에만 병합하는 운영 제어입니다. 이 워크플로는 PR branch 코드를 checkout하거나 실행하지 않고 항상 default branch의 신뢰된 스크립트만 실행합니다.

## 실행 방식

- 정기 실행: 매시 17분 UTC에 `schedule` 이벤트로 실행합니다.
- 수동 실행: branch를 선택할 수 있는 `workflow_dispatch` 대신 default branch에서만 평가되는 `repository_dispatch`를 사용합니다.

```bash
gh api repos/ContextualWisdomLab/noema/dispatches -X POST --input - <<'JSON'
{"event_type":"commercial-readiness-loop"}
JSON
```

동시 실행은 `noema-hourly-commercial-readiness` concurrency group으로 직렬화하며, 새 실행이 시작되면 오래된 실행을 취소합니다.

## 사전 구성: 전용 Maintainer GitHub App

자동 병합에는 repository의 기본 `GITHUB_TOKEN`을 사용하지 않습니다. `GITHUB_TOKEN`이 만든 merge/push 이벤트는 일반적으로 후속 workflow run을 발생시키지 않으므로, 그대로 사용하면 merge 후 `main`의 CI·release workflow가 생략될 수 있습니다. Noema는 별도 Maintainer GitHub App installation token으로 dispatch와 merge를 수행합니다.

Repository variable과 secret을 다음 이름으로 등록합니다.

- `NOEMA_MAINTAINER_APP_CLIENT_ID`: 전용 Maintainer App client ID
- `NOEMA_MAINTAINER_APP_PRIVATE_KEY`: 전용 Maintainer App private key
- `NOEMA_REVIEWER_LOGIN`: 신뢰할 Noema reviewer GitHub App의 정확한 bot login(예: `noema-reviewer[bot]` 형식)
- `NOEMA_MAINTENANCE_ENABLED`: App 설치·권한·secret·reviewer login 검증이 끝난 뒤에만 문자열 `true`로 설정

매시간 `scheduler-activation-preflight`는 쓰기 권한이나 App token 없이 먼저 실행됩니다. 이 preflight는 필수 설정의 존재 여부를 job 내부에서만 평가하고, 공개 저장소에서 다운로드 가능한 `scheduler-activation-evidence`에는 개별 설정 이름·존재 여부·누락 항목을 남기지 않습니다. Artifact에는 workflow source SHA, 실행 identity, `write_ready`, 그리고 구성 상태를 역추론할 수 없는 고정 terminal classification/reason만 남깁니다.

`NOEMA_MAINTENANCE_ENABLED`가 정확히 `true`가 아니거나 필수 App/reviewer 설정이 없으면 credential-bearing `maintain` job만 skipped 상태로 유지됩니다. 따라서 scheduler 전체가 무설명 `skipped`로 사라지지 않으면서도 기본 `GITHUB_TOKEN` fallback이나 권한 확대 없이 실패 폐쇄됩니다. 공개 artifact의 `activation_prerequisite_unavailable`은 어느 설정이 없거나 비활성인지 밝히지 않습니다. 정확한 구성 진단은 repository 관리자 제어면과 별도의 access-controlled App readiness evidence에서 수행해야 합니다.

활성화 후 `NOEMA_REVIEWER_LOGIN`이 비어 있거나 `[bot]` 형식이 아니면 기존 governance script가 repository write 전에 다시 실패합니다. Activation preflight는 write-lane 진입 가능성만 분류하며 App 설치 범위, 실제 permission, reviewer identity 또는 branch protection을 승인하지 않습니다.

App은 `ContextualWisdomLab/noema`에만 설치하고 다음 repository permission만 부여합니다.

- Actions: Read
- Checks: Read
- Contents: Read and write
- Metadata: Read
- Pull requests: Read and write
- Commit statuses: Read

이 App은 Noema review verdict를 작성하는 reviewer App과 분리합니다. reviewer App의 contents permission을 write로 확대하지 않습니다.

## 활성화 RCA와 현실성 분류

과거 구조는 sole maintenance job에 `if: vars.NOEMA_MAINTENANCE_ENABLED == 'true'`를 직접 배치했습니다. 조건이 false이거나 integration에서 값을 평가할 수 없으면 job에 step이 하나도 생성되지 않아, 운영자는 의도적인 비활성화와 구성 누락을 구분할 수 없었습니다. 동일 workflow를 재실행하는 것은 원인 증거를 추가하지 않으므로 현실적인 복구가 아닙니다.

현재 구조는 다음 순서를 강제합니다.

```text
read-only activation preflight
→ bounded configuration-opaque evidence
→ feasibility classification
→ only when write_ready=true: Maintainer App token mint
→ live main governance audit
→ exact-head PR loop
```

| terminal classification | 의미 | write lane |
| --- | --- | --- |
| `EXTERNAL_GATE_REMAINS` | 하나 이상의 activation prerequisite가 충족되지 않았으나 공개 evidence로 개별 상태를 노출하지 않음 | 닫힘 |
| `SAFETY_OR_POLICY_BLOCKER` | repository identity나 workflow source SHA가 비정상 | 닫힘 |
| `NO_ACTION_NEEDED` | activation prerequisite가 모두 존재해 기존 governance lane을 평가할 수 있음 | 열림 |

`NO_ACTION_NEEDED`는 병합 가능, review 승인, security 통과, release 또는 acquisition readiness를 뜻하지 않습니다. 오직 credential-bearing governance lane을 시작할 수 있다는 activation 판단입니다. 실제 병합 권한은 이후 exact-head Checks, review, ruleset 및 SHA-bound merge 검증에 남습니다.

## 결정 상태

| 상태 | 의미 | 자동 쓰기 |
| --- | --- | --- |
| `blocked` | 하나 이상의 필수 근거가 누락·대기·실패·오래됨 상태 | 없음 |
| `request_review` | 기계 검증과 사람 리뷰는 준비됐지만 현재 head Noema 승인만 없음 | 정확한 head SHA로 `noema-review` dispatch |
| `review_in_progress` | 동일 저장소·PR·head에 대한 central review가 이미 queued/in progress | 중복 dispatch 없음 |
| `merge` | 모든 fail-closed 조건 충족 | 최종 재조회 후 SHA-bound squash merge |
| `operational_error` | GitHub API, pagination, JSON 또는 쓰기 실패 | 워크플로 실패 및 보고서 보존 |

## 필수 병합 근거

현재 head에 다음 check run 이름이 모두 존재하고 `completed/success`여야 합니다.

- `verify`
- `reviewer`
- `scorecard`
- `osv-scan`
- `trivy-fs`
- `dependency-review`

필수 check는 이름만 일치해서는 안 되며 GitHub Check Runs 응답의 `app.slug`가 `github-actions`여야 합니다. 제3자 App이 같은 이름의 성공 check를 게시해도 필수 gate를 충족하지 못하며, 동일 이름의 신뢰된 check가 여러 개면 모두 성공해야 합니다.

Check Runs API는 `filter=all`과 전체 pagination으로 수집합니다. 재실행 이력 때문에 과거 실패가 영구 차단하지 않도록 동일한 `check_suite.id`·`app.slug`·check 이름 안에서는 가장 최신 attempt만 유효하게 평가합니다. 반면 서로 다른 check suite가 같은 이름을 게시한 경우에는 각각 독립적인 필수 근거로 유지해, 중복 workflow나 별도 suite의 실패·대기를 숨기지 않습니다. suite 또는 producer 식별자가 불완전한 check는 제거하지 않고 관측 check로 남겨 실패-폐쇄 처리합니다.

`reviewer-ci`는 path filter 없이 모든 PR에서 실행되어 100% line/branch coverage와 100% docstring coverage를 유지합니다. 추가로 관측된 check/status도 성공해야 합니다.

`opencode-review`와 `metadata-only gate evaluation`은 review-dependent checks입니다. 이 예외 역시 `github-actions`가 생성한 check에만 적용합니다. Noema 승인 전에는 이 두 check가 대기 중이어도 review dispatch를 허용해 순환 대기를 방지하지만, Noema 승인 후 실제 병합 시점에는 완료된 허용 결론이 필요합니다.

## 리뷰와 head 결속

- unresolved review thread가 하나라도 있으면 병합하지 않습니다.
- 사람과 bot을 포함해 reviewer별 최신 유효 상태가 `CHANGES_REQUESTED`이면 병합하지 않습니다.
- Noema verdict는 `NOEMA_REVIEWER_LOGIN`과 정확히 일치하는 GitHub Bot만 신뢰합니다. 단순히 login에 `noema`가 포함되거나 body marker를 복제한 다른 App은 승인 주체가 될 수 없습니다.
- 신뢰된 reviewer의 review에도 `Reviewer credential: noema-github-app`과 정확한 40자 head SHA marker가 모두 있어야 합니다.
- 동일 head에 대한 central review workflow가 이미 active이면 재dispatch하지 않습니다.
- 병합 직전 PR state, base=`main`, same-repository head, head SHA, mergeability, thread, review, check, status를 다시 수집합니다.
- GitHub merge API에도 예상 SHA를 전달하므로 head가 움직이면 SHA-bound 병합이 거부됩니다.

## 권한 경계

Workflow-level `GITHUB_TOKEN`은 `contents: read`만 갖습니다. Activation preflight는 checkout, App token mint, repository API write, OIDC 또는 secret 출력 없이 `write_ready` 결정을 계산합니다. 개별 variable/secret 존재 여부는 downstream output, artifact, step summary 또는 로그에 직렬화하지 않습니다. PR 조회·dispatch·merge는 preflight가 `write_ready=true`를 증명한 뒤 `actions/create-github-app-token`이 발급한 짧은 수명의 Maintainer App token으로 수행하며, action 입력에서 `actions: read`, `checks: read`, `contents: write`, `metadata: read`, `pull-requests: write`, `statuses: read`를 명시합니다.

워크플로와 Maintainer App은 `issues: write`, `id-token: write`, secret write, administration 권한을 갖지 않습니다. App token 발급 실패나 permission 부족은 `operational_error`로 실패-폐쇄 처리합니다.

## 감사 산출물

모든 schedule/dispatch 실행은 `scheduler-activation-evidence` artifact에 `artifacts/operations/hourly-scheduler-activation.json`을 90일 보존합니다. GitHub의 public-repository artifact API는 public resource 조회를 허용하므로 이 JSON은 공개 가능 자료로 취급합니다. Repository, exact workflow source SHA, run identity, `write_ready`, configuration-opaque reason code와 terminal classification만 포함하며, variable/secret 이름별 존재 여부, secret, private key, token, reviewer credential 또는 vulnerability detail은 포함하지 않습니다.

Credential-bearing loop가 실행되면 `commercial-readiness-loop-report` artifact에 `artifacts/commercial-readiness/hourly-loop-report.json`도 90일 보존합니다. 주요 필드는 다음과 같습니다.

```json
{
  "schemaVersion": 1,
  "repository": "ContextualWisdomLab/noema",
  "generatedAt": "ISO-8601 timestamp",
  "apply": true,
  "openPullRequestCount": 1,
  "remainingOpenPullRequestCount": 0,
  "results": [
    {
      "number": 26,
      "headSha": "40-character SHA",
      "decision": "merge",
      "result": "merged",
      "reasons": []
    }
  ]
}
```

PR 처리 후 남은 열린 PR이 0개이면 기존 `readiness:audit`, `acquisition:manifest`, `acquisition:audit`를 `NOEMA_AUDIT_REPORT_ONLY=1`로 실행하고 `no-pr-commercial-readiness-evidence` artifact를 남깁니다.

## 실패-폐쇄 경계

이 루프는 다음 근거를 생성하거나 대체하지 않습니다.

- 30일 production KPI 및 provenance
- 실제 customer pilot와 support handover
- ARR, LOI, weighted pipeline과 같은 revenue evidence
- IP, license, GitHub App, Cloudflare, privacy transfer evidence
- repository ruleset과 protected branch

누락된 production KPI 또는 revenue evidence는 보고서에서 계속 `NOT_READY`로 남아야 하며 코드로 꾸며내지 않습니다. default branch 강제 보호와 break-glass 정책은 issue #27의 외부 governance 작업입니다. PR 코드를 자율 수정하기 위한 격리 sandbox는 issue #9 범위이며, 해당 격리 계층이 구현되기 전 이 워크플로는 untrusted PR code를 실행하거나 자동 편집하지 않습니다.

## 운영 점검

1. 모든 실행에서 먼저 `scheduler-activation-evidence`의 terminal classification과 reason code를 확인합니다.
2. `EXTERNAL_GATE_REMAINS`이면 public artifact만으로 누락된 prerequisite를 추정하지 않습니다. Repository 관리자 제어면과 access-controlled `maintainer-app-readiness` 증거에서 maintenance activation, App configuration, reviewer identity를 각각 확인합니다.
3. Configuration 복구 시 `GITHUB_TOKEN` fallback이나 permission 확대를 추가하지 않습니다.
4. `commercial-readiness-loop-report`에서 각 PR의 reason code를 확인합니다.
5. `required_check_missing`이 있으면 workflow trigger, `app.slug=github-actions`, ruleset context 이름을 점검합니다.
6. `review_in_progress`가 장시간 유지되면 `central-review.yml` run과 contextual-orchestrator 상태를 점검합니다.
7. `merge_state_not_clean`이면 충돌·behind 상태·repository policy를 해소합니다.
8. Maintainer App token mint가 실패하면 App 설치 대상과 정확한 permissions를 확인합니다. `GITHUB_TOKEN` fallback을 추가하지 않습니다.
9. Noema 승인 marker가 존재하는데 `noema_current_head_approval_missing`이 남으면 `NOEMA_REVIEWER_LOGIN`이 실제 App bot login과 정확히 일치하는지 확인합니다.
10. `operational_error`이면 artifact의 bounded detail과 GitHub Actions 로그를 확인하고, 권한을 넓히기 전에 실제 API 실패 원인을 수정합니다.

상세 RCA와 설계 근거는 `docs/doctoring/hourly-scheduler-activation-feasibility.md`에 기록합니다.
