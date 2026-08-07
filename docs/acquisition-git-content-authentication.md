# Acquisition Git Content Authentication

Noema의 buyer data-room 검증은 `git diff-files`가 clean이라고 보고한 사실만으로 tracked checkout의 실제 bytes가 exact commit과 같다고 승인하지 않는다. Git index는 성능을 위해 파일의 cached stat metadata를 저장하며, timestamp와 size 조건에 따라 내용이 바뀌어도 stat tuple이 같아 보이는 “racily clean” 상태가 발생할 수 있다.

## Required verification sequence

Acquisition manifest 생성과 integrity audit는 다음 검사를 모두 통과해야 한다.

1. exact `HEAD^{commit}`을 local object database에서 40자리 SHA로 해석한다.
2. `skip-worktree`와 `assume-unchanged` index hint를 bounded NUL-delimited inspection으로 거부한다.
3. staged index가 exact HEAD와 같은지 `git diff --cached`로 확인한다.
4. ordinary worktree drift를 `git diff-files`로 확인한다. 이 단계는 빠른 defense in depth이며 최종 byte authority가 아니다.
5. `git ls-files --stage -z --cached` 결과를 binary/NUL-delimited evidence로 읽고, ASCII header와 fatal UTF-8 path를 분리 검증한다.
6. stage-zero `100644` 또는 `100755` regular-file entry만 허용한다. Symlink, gitlink, sparse-directory mode, unmerged stage는 fail-closed다.
7. 각 path를 `lstat`한 뒤 `O_RDONLY | O_NOFOLLOW` descriptor로 열고, path와 descriptor의 device, inode, mode, size, modification time, change time이 일치해야 한다.
8. index executable mode와 descriptor의 owner-execute bit를 독립적으로 비교한다.
9. descriptor size를 기준으로 `size + 1` bounded buffer를 할당하고 descriptor에서 직접 읽는다. Short read, growth 또는 invalid read count를 거부한다.
10. read 후 descriptor와 path identity를 다시 비교한다.
11. descriptor에서 읽은 exact bytes를 `git hash-object --stdin`으로 계산하고 index object ID와 정확히 비교한다.
12. index hint와 exact HEAD를 다시 확인한다.

Pathname을 두 번째로 다시 열어 hash하지 않으므로 검증 전 path와 hash 대상 사이의 교체 경로를 줄인다. Tracked symbolic link는 현재 descriptor-bound link-target read가 제공되지 않으므로 허용 가능한 source mode로 취급하지 않는다.

## Bounded work

Raw authentication은 다음 상한을 적용한다.

- index output: 2 MiB
- tracked entry count: 20,000
- one path: 4,096 UTF-8 bytes
- one tracked regular file: 32 MiB
- all authenticated tracked bytes: 256 MiB
- each Git subprocess: 10 seconds
- ordinary Git command output: 4 KiB

Per-file 및 aggregate byte budget은 해당 descriptor read와 blob hash를 시작하기 전에 확인된다. 따라서 oversized checkout을 읽은 뒤 뒤늦게 거부하지 않는다.

## Why descriptor-bound stdin hashing is used

Acquisition source identity는 checkout의 실제 bytes를 인증한다. `.gitattributes`의 clean filter, end-of-line conversion, pathname 재해석 또는 repository-local helper가 현재 filesystem bytes를 대신할 수 없다.

Noema는 `O_NOFOLLOW` descriptor로 인증한 regular file bytes만 읽고, 그 buffer를 `git hash-object --stdin`에 전달한다. Git은 standard input을 blob contents로 hash하므로 pathname filter나 두 번째 path open에 의존하지 않는다. Hash 전후 descriptor/path identity와 executable mode는 blob contents와 별도로 검증한다.

## Failure policy

다음은 모두 fail-closed evidence-integrity failure다.

- invalid UTF-8 또는 path traversal
- unsupported object mode, symlink, gitlink, sparse directory, unmerged stage
- `O_NOFOLLOW` 미지원
- path/descriptor object type 또는 identity mismatch
- executable mode mismatch
- short read, growth, invalid byte count, metadata movement
- malformed Git output 또는 hash mismatch
- per-file·aggregate·entry·path budget 초과

이 실패를 cached success, commit status, model judgement, severity downgrade, ignore rule, repair workflow 또는 self-modifying GitHub Actions로 승인 상태로 바꾸지 않는다.

## Evidence separation

이 gate의 PASS는 다음을 대신하지 않는다.

- GitHub check-run 또는 commit-status 성공
- independent reviewer `APPROVE`
- CodeRabbit, OpenCode, Noema 또는 다른 model judgement
- branch protection/ruleset enforcement
- merge-result compatibility
- release provenance, immutable publication 또는 deployment acceptance
- buyer KPI, revenue, transfer 또는 governance evidence

각 evidence plane은 exact checked SHA와 producer를 별도로 보존해야 한다.

## Operational response

`tracked checkout differs from its authenticated Git index bytes` 또는 descriptor-bound verification failure가 발생하면 다음 순서로 복구한다.

1. 현재 process가 보고한 source SHA를 승인하지 않는다.
2. tracked file과 index hint를 신뢰된 checkout에서 복구한다.
3. 다른 writer가 branch를 이동했는지 live exact head를 다시 읽는다.
4. 새 exact checkout에서 manifest를 다시 생성한다.
5. integrity, CI, security, coverage, review, provenance gate를 모두 다시 실행한다.

## References

Git Project. (2026). *Git documentation: git-hash-object*. https://git-scm.com/docs/git-hash-object

Git Project. (2026). *Git documentation: git-ls-files*. https://git-scm.com/docs/git-ls-files

Git Project. (2026). *Racy Git*. https://git-scm.com/docs/racy-git.html

OpenJS Foundation. (2026). *File system*. Node.js documentation. https://nodejs.org/api/fs.html
