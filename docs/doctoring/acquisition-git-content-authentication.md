# Doctoring: Acquisition Git Raw-Content Authentication

## Decision

Noema의 acquisition exact-checkout preflight는 cached stat equality나 `git diff-files` success를 tracked-byte authority로 사용하지 않는다. Stage-zero index가 선언한 Git blob object ID와 현재 checkout의 raw content로 다시 계산한 object ID가 정확히 같아야 한다.

Ordinary Git comparison은 계속 유지한다. 다만 그 역할은 staged mode/state, 일반적인 worktree drift, submodule 관련 이상을 빠르게 찾는 defense in depth다. 최종 raw-content 판정은 regular file과 symbolic-link target의 Git object ID recomputation이다.

## Why cached stat equality is insufficient

Git index는 working tree와의 비교를 빠르게 하기 위해 `lstat(2)`에서 얻은 type, executable bits, modification/change timestamps, owner, inode, size 같은 metadata를 저장한다. Git의 공식 racy-git 문서는 같은 size를 유지한 빠른 in-place modification에서 cached stat information이 실제 file과 같아 보여 내용이 달라도 unmodified로 오판될 수 있음을 설명한다. Linux build에서는 nanosecond timestamp comparison이 기본 활성화되지 않을 수 있고, filesystem마다 timestamp granularity도 다르다.

Repository-local `core.trustctime=false`와 `core.checkStat=minimal`은 이 신뢰 범위를 더 약하게 만들 수 있다. Command-scoped `core.trustctime=true`, `core.checkStat=default`, `core.ignoreStat=false`, `core.filemode=true`를 강제하는 것은 유효한 defense in depth지만 raw bytes의 독립 인증을 대체하지 않는다. 특히 acquisition evidence는 “대부분의 개발 환경에서 변경을 찾는다”가 아니라 “이 exact checkout의 bytes가 index object와 같다”는 강한 명제를 요구한다.

## Test-first evidence

첫 RED 회귀는 다음 실제 Git repository를 구성했다.

1. `core.trustctime=false`, `core.checkStat=minimal`을 repository-local로 설정한다.
2. `tracked.txt`를 commit한다.
3. 같은 byte length의 다른 content로 교체한다.
4. modification time을 index에 기록된 값으로 되돌린다.
5. ordinary `git diff-files --quiet`이 clean을 반환하는 precondition을 확인한다.
6. acquisition tracked-byte verifier는 반드시 mismatch를 반환해야 한다.

Stat configuration을 엄격하게 override하는 첫 수정은 이 fixture를 green으로 만들었지만, racy-git의 cached-stat trust 자체를 제거하지 않았다. 후속 RED 회귀는 `verifyAcquisitionTrackedBytes`라는 독립 raw-object contract를 요구했다. Production 구현은 stage-zero index object ID를 읽고 현재 bytes를 다시 hash하여 이 contract를 충족한다.

## Authoritative algorithm

### Index identity

`git ls-files --stage -z --cached --`를 사용한다. Git 문서가 정의한 stage output은 mode, object ID, stage, path이며 `-z`는 unusual character quoting 대신 verbatim path와 NUL terminator를 제공한다.

Noema는 다음을 거부한다.

- 20,000개 초과 entry
- 2 MiB 초과 index output/path budget
- stage 1–3 unmerged entry
- regular file과 symbolic link 외 mode
- gitlink 또는 sparse-directory representation
- repository root/상위 경로로 resolve되는 path
- 4,096 UTF-8 byte 초과 path
- malformed 또는 unterminated output

### Raw Git blob identity

Regular file은 `git hash-object --no-filters -- <path>`로 계산한다. Git primary documentation에 따르면 기본 object type은 blob이고, `--no-filters`는 attributes mechanism의 input filter와 end-of-line conversion을 무시하여 contents를 그대로 hash한다.

Symbolic link는 link target bytes를 `readlink`로 읽고 `git hash-object --stdin`에 전달한다. Git 문서는 `--stdin`이 file path 대신 standard input에서 object를 읽으며, `--path`가 없으면 filter가 적용되지 않는다고 정의한다.

계산된 40자리 SHA-1 또는 64자리 SHA-256 object ID는 index object ID와 exact-match해야 한다. Repository object format 선택은 Git executable/local object database가 담당하므로 verifier가 SHA-1을 고정 가정하지 않는다.

### Mutation and resource boundaries

각 path는 hash 전후 `lstat` metadata의 device, inode, mode, size, mtime, ctime을 비교한다. Metadata movement는 concurrent replacement 신호로 fail-closed 처리한다. Hash equality가 content authority이며 metadata comparison은 path-to-object stability 보조 통제다.

Hash를 시작하기 전에 다음 budget을 확인한다.

- regular file 또는 link target 32 MiB
- aggregate tracked content 256 MiB
- Git subprocess 10초
- hash/index output bounded buffer

Oversized entry는 해당 contents를 hash한 뒤 거부하지 않고 read 전에 거부한다.

## Trust boundary

`spawnSyncImpl`은 deterministic unit test를 위한 dependency-injection seam이다. 이를 교체한 caller는 exact HEAD, index flag, staged/worktree comparison 등 모든 Git evidence producer를 이미 통제하므로 production authorization caller가 아니다. Manifest generator와 integrity audit는 기본 trusted Git executable을 사용하며 raw-content pass를 실행한다.

이 통제는 hostile privileged process가 filesystem과 Git executable을 동시에 조작하는 상황, kernel compromise, malicious object database를 해결한다고 주장하지 않는다. Trusted runner/checkout provisioner, Node runtime, Git executable, local object database는 bootstrap trust root다. Protected branch, exact-head CI, provenance와 release attestation이 그 상위 authenticity plane을 담당한다.

## Evidence-plane separation

Raw tracked-byte PASS는 CI, GitHub check run, commit status, review, model judgement, branch ruleset, provenance, release, deployment 또는 buyer commercial evidence를 승인하지 않는다. 각 plane의 exact SHA, producer, timestamp, authority를 별도로 검증한다.

## APA 7th references

Git Project. (2026). *Git documentation: git-hash-object*. https://git-scm.com/docs/git-hash-object

Git Project. (2026). *Git documentation: git-ls-files*. https://git-scm.com/docs/git-ls-files

Git Project. (2026). *Racy Git*. https://git-scm.com/docs/racy-git.html
