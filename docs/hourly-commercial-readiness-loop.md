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

`reviewer-ci`는 path filter 없이 모든 PR에서 실행되어 100% line/branch coverage와 100% docstring coverage를 유지합니다. 추가로 관측된 check/status도 성공해야 합니다.

`opencode-review`와 `metadata-only gate evaluation`은 review-dependent checks입니다. Noema 승인 전에는 이 두 check가 대기 중이어도 review dispatch를 허용해 순환 대기를 방지하지만, Noema 승인 후 실제 병합 시점에는 완료된 허용 결론이 필요합니다.

## 리뷰와 head 결속

- unresolved review thread가 하나라도 있으면 병합하지 않습니다.
- reviewer별 최신 유효 상태가 `CHANGES_REQUESTED`이면 병합하지 않습니다.
- Noema 리뷰는 GitHub Bot, `Reviewer credential: noema-github-app`, 정확한 40자 head SHA marker가 모두 일치해야 합니다.
- 동일 head에 대한 central review workflow가 이미 active이면 재dispatch하지 않습니다.
- 병합 직전 PR state, base=`main`, same-repository head, head SHA, mergeability, thread, review, check, status를 다시 수집합니다.
- GitHub merge API에도 예상 SHA를 전달하므로 head가 움직이면 SHA-bound 병합이 거부됩니다.

## 권한

워크플로 권한은 다음으로 제한합니다.

- `actions: read`: central review 실행 중복 확인
- `checks: read`: current-head check run 확인
- `contents: write`: repository dispatch 및 merge에 필요한 repository write capability
- `pull-requests: write`: PR 메타데이터·리뷰 조회와 병합
- `security-events: read`: 보안 게이트 증빙 접근
- `statuses: read`: commit status 확인

워크플로는 `issues: write`, `id-token: write`, secret write 권한을 갖지 않습니다.

## 감사 산출물

모든 실행은 `commercial-readiness-loop-report` artifact에 `artifacts/commercial-readiness/hourly-loop-report.json`을 90일 보존합니다. 주요 필드는 다음과 같습니다.

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

1. `commercial-readiness-loop-report`에서 각 PR의 reason code를 확인합니다.
2. `required_check_missing`이 있으면 workflow trigger와 ruleset context 이름을 점검합니다.
3. `review_in_progress`가 장시간 유지되면 `central-review.yml` run과 contextual-orchestrator 상태를 점검합니다.
4. `merge_state_not_clean`이면 충돌·behind 상태·repository policy를 해소합니다.
5. `operational_error`이면 artifact의 bounded detail과 GitHub Actions 로그를 확인하고, 권한을 넓히기 전에 실제 API 실패 원인을 수정합니다.
