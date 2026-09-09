# Acquisition Git Content Authentication

Noema의 buyer data-room 검증은 worktree-aware Git 비교를 tracked checkout의 byte authority로 사용하지 않는다. `git diff-files` 같은 경로는 repository-local `.gitattributes`가 선언한 clean/process conversion helper를 실행할 수 있고, Git index는 성능을 위해 cached stat metadata를 사용하므로 same-size·same-timestamp 변조를 실제 bytes와 독립적으로 인증하지 못한다. Index 자체도 mutable state이므로 raw-byte authority의 expected blob identity는 index가 아니라 처음 고정한 exact commit tree에서만 가져온다.

## Required verification sequence

Acquisition manifest 생성과 integrity audit는 다음 검사를 모두 통과해야 한다.

1. exact `HEAD^{commit}`을 local object database에서 40자리 SHA-1 또는 64자리 SHA-256 commit으로 해석한다.
2. `skip-worktree`와 `assume-unchanged` index hint를 bounded NUL-delimited inspection으로 거부한다.
3. staged index가 exact HEAD와 같은지 `git diff --cached`로 확인한다. 이 비교는 worktree를 읽지 않으므로 repository-local clean/process filter를 source-identity helper로 실행하지 않는다.
4. 이미 인증한 exact HEAD를 `git ls-tree -r --full-tree -z`로 읽어 immutable commit-tree의 mode, object ID, path inventory를 만든다. Mutable index object ID는 raw-byte authority로 사용하지 않는다.
5. exact-tree의 `100644` 또는 `100755` regular-file entry만 허용한다. Symlink, gitlink, sparse-directory mode 등 지원하지 않는 object mode는 fail-closed다.
6. 각 path를 `lstat`한 뒤 `O_RDONLY | O_NOFOLLOW` descriptor로 열고, path와 descriptor의 device, inode, mode, size, modification time, change time이 일치해야 한다.
7. exact-tree executable mode와 descriptor의 owner-execute bit를 독립적으로 비교한다.
8. descriptor size를 기준으로 `size + 1` bounded buffer를 할당하고 descriptor에서 직접 읽는다. Short read, growth 또는 invalid read count를 거부한다.
9. read 후 descriptor와 path identity를 다시 비교한다.
10. descriptor에서 읽은 exact bytes에 Git의 `blob <size>\0<bytes>` framing을 적용해 Node 표준 `crypto`의 SHA-1 또는 SHA-256으로 object ID를 계산하고 exact HEAD tree object ID와 정확히 비교한다. 파일별 `git hash-object` subprocess나 pathname 재개방은 사용하지 않는다.
11. index hint와 exact HEAD를 다시 확인한다.

이 순서는 staged-index 비교가 끝난 직후 다른 local writer가 index를 다시 써도 raw-byte authority가 새 index object ID로 바뀌지 않게 한다. Expected blob identity는 처음 고정한 exact HEAD commit tree에서만 파생된다. 또한 worktree-aware `git diff-files`를 preflight에 넣지 않으므로 repository attributes가 등록한 executable clean/process helper를 checkout 인증 전에 실행하지 않는다. Pathname을 두 번째로 다시 열어 hash하지 않으므로 검증 전 path와 hash 대상 사이의 교체 경로도 줄인다. Tracked symbolic link는 현재 descriptor-bound link-target read가 제공되지 않으므로 허용 가능한 source mode로 취급하지 않는다.

## Bounded work

Raw authentication은 다음 상한을 적용한다.

- exact-tree/index parser output: 2 MiB
- tracked entry count: 20,000
- one path: 4,096 UTF-8 bytes
- one tracked regular file: 32 MiB
- all authenticated tracked bytes: 256 MiB
- each Git subprocess: 10 seconds
- ordinary Git command output: 4 KiB

Per-file 및 aggregate byte budget은 해당 descriptor read와 blob hash를 시작하기 전에 확인된다. 따라서 oversized checkout을 읽은 뒤 뒤늦게 거부하지 않는다.

## Why exact-tree descriptor-bound local hashing is used

Acquisition source identity는 checkout의 실제 bytes를 특정 immutable commit에 결박해야 한다. `.gitattributes`의 clean/process filter, end-of-line conversion, pathname 재해석, repository-local helper뿐 아니라 cached stat 또는 concurrently rewritten index도 current filesystem bytes의 expected identity를 대신할 수 없다.

Noema는 먼저 고정된 commit의 tree object IDs를 `git ls-tree`로 읽고, `O_NOFOLLOW` descriptor로 인증한 regular file bytes만 읽는다. 그 exact buffer를 Git blob framing으로 직접 SHA-1/SHA-256 해시하므로 worktree-aware Git conversion, 파일별 subprocess, 두 번째 pathname open에 의존하지 않는다. Hash 전후 descriptor/path identity와 executable mode는 blob contents와 별도로 검증한다.

## Failure policy

다음은 모두 fail-closed evidence-integrity failure다.

- invalid UTF-8 또는 path traversal
- unsupported object mode, symlink, gitlink, sparse directory
- exact-tree listing 또는 object identity mismatch
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

`tracked checkout differs from exact HEAD tree bytes`, exact-tree mismatch 또는 descriptor-bound verification failure가 발생하면 다음 순서로 복구한다.

1. 현재 process가 보고한 source SHA를 승인하지 않는다.
2. tracked file과 index state를 신뢰된 checkout에서 복구한다.
3. 다른 writer가 branch를 이동했는지 live exact head를 다시 읽는다.
4. 새 exact checkout에서 manifest를 다시 생성한다.
5. integrity, CI, security, coverage, review, provenance gate를 모두 다시 실행한다.

## References

Git Project. (2026). *Git documentation: git-ls-tree*. https://git-scm.com/docs/git-ls-tree

Git Project. (2026). *Git documentation: git-ls-files*. https://git-scm.com/docs/git-ls-files

Git Project. (2026). *Git object database*. https://git-scm.com/book/en/v2/Git-Internals-Git-Objects

Git Project. (2026). *Racy Git*. https://git-scm.com/docs/racy-git.html

OpenJS Foundation. (2026). *Crypto*. Node.js documentation. https://nodejs.org/api/crypto.html

OpenJS Foundation. (2026). *File system*. Node.js documentation. https://nodejs.org/api/fs.html
