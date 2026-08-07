# Acquisition Data-Room Integrity

Noema의 buyer data room은 `data-room-manifest.json`을 **신뢰할 수 있는 판정 결과가 아니라 검증 대상인 색인**으로 취급한다. 매각·인수 readiness 판단은 저장된 `passed`, `finalGatePassed`, `missingRequired`, `missingFinalGate` 값을 그대로 사용하지 않는다. `npm run acquisition:integrity`가 현재 checkout의 정확한 Git commit과 retained evidence bytes에서 이를 다시 계산해야 한다.

## Authoritative commands

```bash
npm run acquisition:manifest
npm run acquisition:integrity
npm run acquisition:audit
```

`npm run acquisition:audit`은 integrity pre-gate를 먼저 실행한다. 따라서 모든 다른 commercial evidence가 green이어도 위조되거나 오래된 manifest는 acquisition readiness를 통과시킬 수 없다. `release:verify`와 `release:verify:strict`도 manifest 생성 직후 동일한 integrity gate를 실행한다.

Manifest와 integrity 단계가 별도 경로를 추측하지 않도록 `NOEMA_DATA_ROOM_OUTPUT_DIR`과 `NOEMA_ACQUISITION_AUDIT_OUTPUT_DIR`은 동일한 configured data-room root의 호환 입력으로 취급한다. 어느 것도 지정하지 않으면 두 단계 모두 exact authenticated head에 고정된 `artifacts/acquisition-readiness/<exact-head-sha>/`를 사용한다. `NOEMA_DATA_ROOM_MANIFEST_PATH`를 명시하면 두 단계가 그 exact manifest를 사용한다. 따라서 한쪽 output-dir 변수만 설정된 경우나 두 프로세스 사이 UTC 날짜가 바뀌는 경우에도 서로 다른 date-derived manifest를 검사하지 않는다.

## Exact source and release binding

생성된 manifest는 다음 identity를 포함한다.

- `schemaVersion: 1`
- `repository: ContextualWisdomLab/noema`
- `objective: NOEMA-GOAL-ACQUISITION-2B-2026-07-02`
- `source.commitSha`: manifest를 생성한 checkout의 정확한 40자리 Git commit
- 선택된 release가 있을 때 `release.tag`와 그 tag가 실제로 가리키는 `release.commitSha`

`NOEMA_DATA_ROOM_SOURCE_COMMIT`을 지정하면 현재 checkout `HEAD`와 정확히 같아야 한다. `NOEMA_RELEASE_UNDER_DILIGENCE_TAG`를 지정하면 immutable SemVer tag가 로컬 Git object database에서 exact commit으로 해석되어야 한다. 불일치하거나 해석할 수 없는 identity는 fail-closed이다.

### Tracked checkout authentication

`source.commitSha`는 단순한 `git rev-parse HEAD` 기록이 아니다. Manifest generator와 integrity audit는 catalog/verifier를 읽기 전에 `scripts/lib/acquisition-git-preflight.mjs`로 tracked checkout을 인증한다.

1. `HEAD^{commit}`을 local Git object database에서 exact 40-character SHA로 해석한다.
2. system/global Git configuration, hooks, filesystem monitor, untracked cache, replacement objects, lazy fetch, terminal prompt를 비활성화하고 필요한 process-discovery 환경만 전달한다. 격리된 config에서도 CI checkout의 dubious-ownership 보호를 우회하지 않고 정확히 현재 command `cwd`만 command-scope `safe.directory`로 허용한다. 같은 exact `cwd`를 `GIT_WORK_TREE`에도 고정하여 repository-local `core.worktree`가 Git의 tracked-byte 비교를 다른 디렉터리로 redirect하지 못하게 한다.
3. `git ls-files -v -z --cached --`의 전체 NUL-delimited 결과를 최대 2 MiB로 bounded read하고, `S`로 표시되는 `skip-worktree` 또는 lowercase tag로 표시되는 `assume-unchanged` entry가 하나라도 있으면 tracked-byte 비교 전에 실패한다. 이 index hint들은 정상적인 working-tree 검사를 생략하게 할 수 있으므로 acquisition checkout에서는 허용하지 않는다.
4. `git diff --cached --quiet --no-ext-diff --no-textconv --ignore-submodules=none <exact-head> --`로 index의 staged content/mode가 exact commit과 같은지 확인한다. `--cached` 비교는 on-disk worktree를 고려하지 않으므로 repository-configured clean filter가 이 단계의 source identity를 바꿀 수 없다.
5. `git diff-files --quiet --no-ext-diff --no-textconv --ignore-submodules=none --`로 실제 worktree와 이미 인증된 index 사이의 tracked drift를 확인한다. 이 low-level index/worktree 비교를 사용하여 일반 `git diff <commit>`의 check-in conversion 경로가 repository-local `filter.<driver>.clean` command를 실행하거나 그 출력으로 tampering을 숨기는 것을 방지한다.
6. 같은 bounded index inspection을 다시 실행해 comparison 도중 unsafe index hint가 생기지 않았는지 확인한다.
7. `HEAD^{commit}`을 다시 해석해 preflight 도중 branch movement를 거부한다.
8. verifier/catalog module은 이 preflight가 성공한 뒤에만 dynamic import한다.
9. retained evidence를 모두 읽은 뒤 같은 exact SHA를 기대값으로 tracked checkout 전체 절차를 다시 인증하고, source movement·tracked mutation·unsafe index hint가 있으면 output을 성공 evidence로 기록하지 않는다.

이 비교는 **의도적으로 untracked 파일을 dirty source로 취급하지 않는다.** 실제 KPI, deployment receipt, revenue/transfer evidence 같은 acquisition artifact는 checkout에 보존될 수 있지만 source commit 자체의 일부라고 주장하지 않는다. 반대로 tracked README, policy, verifier, catalog, test, documentation 또는 control file이 HEAD와 다르거나 `skip-worktree`/`assume-unchanged`로 실제 working-tree 비교에서 숨겨지면 동일한 `source.commitSha`를 붙여 readiness evidence를 만들 수 없다. Repository-local clean/smudge filter는 정상 개발 workflow에서는 유효한 Git 기능이지만 acquisition preflight의 authorization helper로 실행되거나 그 transformed output이 raw checkout identity를 대신하도록 허용하지 않는다.

Preflight Git 명령은 network fetch를 하지 않으며 `GIT_NO_LAZY_FETCH=1`을 사용한다. 이 경계의 bootstrap trust root는 trusted CI/checkout provisioner가 실행한 Node.js runtime, Git executable/local object database, 두 acquisition entrypoint, 작은 Git preflight module, 그리고 descriptor-safe private-output helper다. 이 코드는 실행 전에 자기 자신을 cryptographically self-authenticate한다고 주장하지 않는다. Bootstrap 자체의 무결성은 protected exact source checkout과 기존 CI/release provenance plane이 담당하고, 이 preflight는 그 이후 current working tree가 exact commit에서 drift하거나 unsafe index hint, repository-local worktree redirection, 또는 repository-configured clean filter로 drift를 숨기는 문제를 차단한다.

## Local evidence verification

각 file entry는 reviewed catalog의 고정된 repository-relative path만 사용할 수 있다. verifier는 다음 절차를 독립적으로 수행한다.

1. traversal, absolute path, backslash alias, 빈 path component, `.`/`..`, control character를 거부한다. 이 명시적 component policy가 POSIX path normalization이 바꿀 수 있는 alias를 선행 차단하므로 별도의 중복 normalize 분기에 의존하지 않는다.
2. `lstat`으로 regular file인지 확인하고 symlink를 거부한다.
3. `O_NOFOLLOW | O_RDONLY` descriptor로 파일을 연다.
4. path metadata와 opened descriptor의 device, inode, size, modification/change time을 비교한다.
5. 최대 32 MiB까지 bounded read한다. 존재하는 0-byte regular file도 descriptor identity가 안전하면 file presence 자체는 정확히 기록하며, 해당 evidence의 의미적 최소 내용은 각 별도 validator가 판정한다.
6. read 후 descriptor와 path identity를 다시 비교하여 replacement 또는 in-place metadata drift를 거부한다.
7. 실제 bytes에서 SHA-256과 byte size를 다시 계산해 manifest의 stored digest/size와 대조한다.

Manifest와 external verification receipt JSON은 최대 2 MiB이며 fatal UTF-8 decode와 duplicate-object-key 검사를 통과해야 한다. 이 경계는 path replacement, symlink substitution, oversized evidence, truncated read, duplicate-key ambiguity를 authorization 전에 거부한다.

Reviewed catalog 자체도 authorization policy다. non-array, empty, 또는 bounded maximum entry count를 초과한 catalog는 빈 policy set으로 축소하지 않고 즉시 fail-closed 처리한다.

### Manifest and audit output boundary

Manifest와 integrity audit의 retained output도 입력 evidence와 동일하게 filesystem trust boundary로 취급한다. `scripts/lib/acquisition-private-output.mjs`는 새 파일을 `O_CREAT | O_EXCL | O_NOFOLLOW`로 만들고, 기존 파일은 먼저 `lstat`으로 single-link regular file임을 확인한 뒤 `O_NOFOLLOW`로 **truncate 없이** 연다. 기존 path와 opened descriptor의 device/inode가 같을 때에만 `ftruncate`하고 UTF-8 bytes를 기록한다. 쓰기 후에는 descriptor 자체에 `0600`을 적용하고 descriptor/path가 여전히 같은 single-link regular file인지 다시 확인한다.

따라서 pre-existing symlink, hard-linked output, non-regular file, open 전 path replacement, write 중 path replacement는 모두 fail-closed이다. Symlink를 따라 다른 파일을 덮어쓰거나 pathname `chmod`가 symlink target의 권한을 바꾸는 방식으로 evidence를 남기지 않는다. 필요한 `O_NOFOLLOW` 상수가 없는 플랫폼에서는 안전하지 않은 fallback으로 내려가지 않고 output write 자체를 거부한다. 이 제약은 Node.js가 일부 POSIX-specific open flags를 모든 운영체제에서 제공하지 않는다고 명시한 동작과 일치한다.

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
- tracked checkout drift를 유지한 채 `source.commitSha`만 HEAD 값으로 기록
- repository-local `core.worktree` 또는 ambient worktree redirection으로 audited `cwd`가 아닌 다른 tree를 Git comparison 대상으로 사용
- repository-configured `filter.<driver>.clean`/`process` helper 또는 transformed output을 acquisition source-identity 판정에 사용
- `skip-worktree` 또는 `assume-unchanged` index hint로 tracked drift를 숨김
- symlink 또는 alternate path로 evidence 대체
- manifest/audit output path에 symlink·hard link·non-regular file을 두고 writer가 이를 따라가도록 허용
- external receipt가 catalog에 고정되지 않은 임의의 retained path를 선택하게 허용
- arbitrary HTTPS URL을 verified evidence로 분류
- remote fetch를 final audit 안에 삽입
- branch protection, independent approval, security gate 우회
- self-modifying/repair GitHub Actions 추가

Tracked source를 exact commit으로 복구하고 unsafe index hint를 제거한 뒤 evidence를 다시 수집하거나 올바른 retained artifact를 복구한다. 안전하지 않은 output leaf가 있으면 해당 filesystem object를 별도의 trusted 운영 절차로 제거·격리한 다음 새 exact checkout에서 다시 생성한다. 그 다음 `npm run acquisition:manifest`를 새 exact checkout에서 다시 생성하고 `npm run acquisition:integrity`를 실행한다.
