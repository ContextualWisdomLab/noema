# Acquisition Git Content Authentication

Noema의 buyer data-room 검증은 `git diff-files`가 clean이라고 보고한 사실만으로 tracked checkout의 실제 bytes가 exact commit과 같다고 승인하지 않는다. Git index는 성능을 위해 파일의 cached stat metadata를 저장하고, 특정 timestamp·size 조건에서는 내용이 바뀌어도 stat tuple이 같아 보일 수 있다. Git 자체 문서도 이를 “racily clean” 상태로 설명한다.

## Required verification sequence

Acquisition manifest 생성과 integrity audit는 다음 검사를 모두 통과해야 한다.

1. exact `HEAD^{commit}`을 local object database에서 40자리 SHA로 해석한다.
2. `skip-worktree`와 `assume-unchanged` index hint를 bounded NUL-delimited inspection으로 거부한다.
3. staged index가 exact HEAD와 같은지 `git diff --cached`로 확인한다.
4. ordinary worktree drift를 `git diff-files`로 확인한다. 이 단계는 빠른 defense in depth이며 최종 byte authority가 아니다.
5. `git ls-files --stage -z --cached`에서 stage-zero mode, object ID, path를 bounded하게 읽는다.
6. 모든 tracked regular file은 `git hash-object --no-filters -- <path>`로 현재 raw bytes의 Git blob object ID를 다시 계산한다.
7. symbolic link는 link target bytes를 읽어 `git hash-object --stdin`으로 계산한다.
8. 계산된 object ID를 index의 exact object ID와 비교한다.
9. hash 전후의 device, inode, mode, size, modification time, change time이 같아야 한다.
10. index hint와 exact HEAD를 다시 확인한다.

Gitlink, sparse-directory mode, unmerged stage, path escape, malformed output, unsupported object mode, hash mismatch, metadata movement는 모두 fail-closed다.

## Bounded work

Raw authentication은 다음 상한을 적용한다.

- index output: 2 MiB
- tracked entry count: 20,000
- one path: 4,096 UTF-8 bytes
- one tracked regular file or link target: 32 MiB
- all authenticated tracked bytes: 256 MiB
- each Git subprocess: 10 seconds
- ordinary Git command output: 4 KiB

Per-file 및 aggregate byte budget은 해당 blob hash를 시작하기 전에 확인된다. 따라서 oversized checkout을 읽은 뒤 뒤늦게 거부하지 않는다.

## Why filters are disabled

Acquisition source identity는 checkout의 실제 bytes를 인증한다. `.gitattributes`의 clean filter나 end-of-line conversion을 적용한 결과가 현재 filesystem bytes를 대신할 수 없다. Git의 `hash-object --no-filters`는 attributes mechanism이 선택할 input filter와 EOL conversion을 무시하고 contents를 그대로 hash한다. Symbolic-link target bytes는 standard input으로 전달하므로 같은 raw-content 원칙을 따른다.

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

`tracked checkout differs from its authenticated Git index bytes`가 발생하면 다음 순서로 복구한다.

1. 현재 process가 보고한 source SHA를 승인하지 않는다.
2. tracked file과 index hint를 신뢰된 checkout에서 복구한다.
3. 다른 writer가 branch를 이동했는지 live exact head를 다시 읽는다.
4. 새 exact checkout에서 manifest를 다시 생성한다.
5. integrity, CI, security, coverage, review, provenance gate를 모두 다시 실행한다.

Stat 설정 완화, ignore rule, severity downgrade, cached success 재사용, repair workflow 또는 self-modifying GitHub Actions로 이 오류를 우회하지 않는다.

## References

Git Project. (2026). *Git documentation: git-hash-object*. https://git-scm.com/docs/git-hash-object

Git Project. (2026). *Git documentation: git-ls-files*. https://git-scm.com/docs/git-ls-files

Git Project. (2026). *Racy Git*. https://git-scm.com/docs/racy-git.html
