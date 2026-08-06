# Acquisition Data-Room Integrity

Noema의 buyer data room은 `data-room-manifest.json`을 **신뢰할 수 있는 판정 결과가 아니라 검증 대상인 색인**으로 취급한다. 매각·인수 readiness 판단은 저장된 `passed`, `finalGatePassed`, `missingRequired`, `missingFinalGate` 값을 그대로 사용하지 않는다. `npm run acquisition:integrity`가 현재 checkout의 정확한 Git commit과 retained evidence bytes에서 이를 다시 계산해야 한다.

## Authoritative commands

```bash
npm run acquisition:manifest
npm run acquisition:integrity
npm run acquisition:audit
```

`npm run acquisition:audit`은 integrity pre-gate를 먼저 실행한다. 따라서 모든 다른 commercial evidence가 green이어도 위조되거나 오래된 manifest는 acquisition readiness를 통과시킬 수 없다. `release:verify`와 `release:verify:strict`도 manifest 생성 직후 동일한 integrity gate를 실행한다.

## Exact source and release binding

생성된 manifest는 다음 identity를 포함한다.

- `schemaVersion: 1`
- `repository: ContextualWisdomLab/noema`
- `objective: NOEMA-GOAL-ACQUISITION-2B-2026-07-02`
- `source.commitSha`: manifest를 생성한 checkout의 정확한 40자리 Git commit
- 선택된 release가 있을 때 `release.tag`와 그 tag가 실제로 가리키는 `release.commitSha`

`NOEMA_DATA_ROOM_SOURCE_COMMIT`을 지정하면 현재 checkout `HEAD`와 정확히 같아야 한다. `NOEMA_RELEASE_UNDER_DILIGENCE_TAG`를 지정하면 immutable SemVer tag가 로컬 Git object database에서 exact commit으로 해석되어야 한다. 불일치하거나 해석할 수 없는 identity는 fail-closed이다.

## Local evidence verification

각 file entry는 reviewed catalog의 고정된 repository-relative path만 사용할 수 있다. verifier는 다음 절차를 독립적으로 수행한다.

1. traversal, absolute path, backslash alias, 빈 path component, `.`/`..`, control character를 거부한다.
2. `lstat`으로 regular file인지 확인하고 symlink를 거부한다.
3. `O_NOFOLLOW | O_RDONLY` descriptor로 파일을 연다.
4. path metadata와 opened descriptor의 device, inode, size, modification/change time을 비교한다.
5. 최대 32 MiB까지 bounded read한다.
6. read 후 descriptor와 path identity를 다시 비교하여 replacement 또는 in-place metadata drift를 거부한다.
7. 실제 bytes에서 SHA-256과 byte size를 다시 계산해 manifest의 stored digest/size와 대조한다.

Manifest와 external verification receipt JSON은 최대 2 MiB이며 fatal UTF-8 decode와 duplicate-object-key 검사를 통과해야 한다. 이 경계는 path replacement, symlink substitution, oversized evidence, truncated read, duplicate-key ambiguity를 authorization 전에 거부한다.

## External evidence is declaration-only by default

`https://` URL은 evidence 존재 증명이 아니다. 예를 들어 FigJam value map URL은 immutable local verification receipt가 없으면 `declared` 상태이며 final gate를 충족하지 않는다.

외부 evidence가 final gate를 충족하려면 reviewed catalog가 **receipt path와 retained artifact path를 둘 다 고정**해야 한다. Receipt는 catalog의 `receiptPath`에 있어야 하며 `artifact.path`는 catalog의 `artifactPath`와 정확히 같아야 한다. 단순히 canonical한 repository-relative path라는 이유만으로 다른 파일을 선택할 수 없다. 예를 들어 동일한 digest metadata를 갖춘 receipt가 `README.md`나 다른 정상 파일을 가리켜도 reviewed artifact path와 다르면 즉시 거부한다.

Receipt는 다음을 모두 충족해야 한다.

```json
{
  "schemaVersion": 1,
  "repository": "ContextualWisdomLab/noema",
  "source": { "commitSha": "<exact 40-character commit>" },
  "sourceUrl": "<exact catalog URL>",
  "collectedAt": "<canonical UTC timestamp>",
  "collector": "<producer or collector identity>",
  "provenance": "<how the immutable export was collected>",
  "artifact": {
    "path": "<exact reviewed catalog artifactPath>",
    "bytes": 123,
    "sha256": "<64 lowercase/uppercase hex characters>"
  }
}
```

Verifier는 receipt가 선언한 임의 경로를 신뢰하지 않고 catalog에 고정된 `artifactPath`만 같은 bounded no-follow 정책으로 읽는다. Retained artifact의 실제 byte size 및 SHA-256을 다시 계산하고 receipt의 값과 비교한다. Receipt의 URL syntax만 맞거나 remote endpoint가 현재 접근 가능하다는 사실만으로는 final gate를 통과하지 않는다. 최종 audit은 네트워크 요청을 하지 않는다.

현재 FigJam entry의 reviewed paths는 다음과 같다.

```text
receiptPath:  artifacts/acquisition/figjam-value-map-verification.json
artifactPath: artifacts/acquisition/figjam-value-map-export.json
```

실제 immutable export가 정확한 `artifactPath`에 보존되고 위 receipt가 이를 정확히 인증하기 전까지 이 entry는 `declared`이며 `missingFinalGate`에 남는다.

## Persisted claims are cross-checks, not authority

Verifier는 reviewed catalog를 기준으로 entry ID set을 정확히 비교하고 duplicate/unknown/missing entry를 거부한다. 각 entry의 `id`, `category`, `kind`, `required`, `requiredForFinalGate`, path/command/URL/receipt path/artifact path, validator metadata가 catalog와 동일해야 한다.

그 다음 실제 retained evidence에서 `passed`, `finalGatePassed`, `missingRequired`, `missingFinalGate`를 다시 계산한다. 저장된 값은 trusted recomputation과 정확히 일치해야 하며, 다른 경우 manifest integrity 자체가 실패한다. 따라서 `finalGatePassed: true`를 수동으로 적거나 gap list를 삭제해도 readiness를 만들 수 없다.

## Separation of evidence planes

Data-room integrity PASS는 다음을 의미하지 않는다.

- CI/check run 성공
- GitHub commit status 성공
- human 또는 independent review approval
- CodeRabbit/OpenCode/model judgement 승인
- branch protection 충족
- release acceptance
- production deployment acceptance
- revenue, transfer, production KPI 또는 governance evidence 충족

Integrity gate는 **색인이 주장하는 evidence가 현재 retained bytes와 exact source/release identity에 맞는지**만 검증한다. 실제 KPI·배포·보안·매출·이관 evidence가 없으면 해당 독립 gate는 계속 RED/NOT_READY여야 한다.

## Failure handling

Integrity failure를 해결하기 위해 다음을 해서는 안 된다.

- stored Boolean이나 gap list를 수동으로 green으로 변경
- symlink 또는 alternate path로 evidence 대체
- external receipt가 catalog에 고정되지 않은 임의의 retained path를 선택하게 허용
- arbitrary HTTPS URL을 verified evidence로 분류
- remote fetch를 final audit 안에 삽입
- branch protection, independent approval, security gate 우회
- self-modifying/repair GitHub Actions 추가

Evidence를 다시 수집하거나 올바른 retained artifact를 복구한 뒤 `npm run acquisition:manifest`를 새 exact checkout에서 다시 생성하고 `npm run acquisition:integrity`를 실행한다.
