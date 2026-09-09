# Acquisition Git Content Authentication

Noema의 buyer data-room 검증은 Git의 작업 트리 비교 결과나 index의 cached stat metadata를 바이트 일치의 근거로 승인하지 않는다. 작업 트리 변환은 `.gitattributes` 또는 `.git/info/attributes`가 선택한 `clean/process` 프로그램을 실행할 수 있다. 따라서 acquisition preflight는 `git diff-files`를 호출하지 않고, 고정한 commit tree의 blob ID와 직접 읽은 바이트를 비교한다. 구현 결정과 검증 범위는 [conversion-boundary ADR](adr/proposed_acquisition_git_conversion_boundary.md)에 기록한다.

## Required verification sequence

Acquisition manifest 생성과 integrity audit는 다음 검사를 모두 통과해야 한다.

1. exact `HEAD^{commit}`을 local object database에서 40자리 SHA-1 또는 64자리 SHA-256 commit ID로 해석한다.
2. `skip-worktree`와 `assume-unchanged` index hint를 bounded NUL-delimited inspection으로 거부한다.
3. staged index가 exact HEAD와 같은지 `git diff --cached --quiet --no-ext-diff --no-textconv --ignore-submodules=none`으로 확인한다. 작업 트리 변환을 호출하는 `diff-files`는 실행하지 않는다.
4. 이미 인증한 exact HEAD를 `git ls-tree -r --full-tree -z`로 읽어 immutable commit-tree의 mode, object ID, path inventory를 만든다. Mutable stage-zero index object ID를 raw-byte authority로 사용하지 않는다.
5. exact-tree의 `100644` 또는 `100755` regular-file entry만 허용한다. Symlink, gitlink, sparse-directory mode 등 지원하지 않는 object mode는 fail-closed다.
6. 각 path를 `lstat`한 뒤 `O_RDONLY | O_NOFOLLOW` descriptor로 열고, path와 descriptor의 device, inode, mode, size, modification time, change time이 일치해야 한다.
7. exact-tree executable mode와 descriptor의 owner-execute bit를 독립적으로 비교한다.
8. descriptor size를 기준으로 `size + 1` bounded buffer를 할당하고 descriptor에서 직접 읽는다. Short read, growth 또는 invalid read count를 거부한다.
9. read 후 descriptor와 path identity를 다시 비교한다.
10. Node `createHash`로 Git blob framing인 `blob <byte_length>\0`과 실제 바이트를 SHA-1 또는 SHA-256으로 계산하고 exact HEAD tree object ID와 비교한다. 이 단계에서 `git hash-object` subprocess를 실행하지 않는다.
11. index hint와 exact HEAD를 다시 확인한다.

이 순서는 staged-index 비교 직후 다른 writer가 index를 다시 써도 raw-byte authority가 새 index object ID로 바뀌지 않게 한다. Expected blob identity는 처음 고정한 exact HEAD commit tree에서만 파생된다. Pathname을 두 번째로 열어 hash하지 않으므로 검증한 descriptor와 hash 대상 사이의 교체 경로도 줄인다. Tracked symbolic link는 현재 descriptor-bound link-target read가 제공되지 않으므로 허용하지 않는다.

## Bounded work

Raw authentication은 다음 상한을 적용한다.

- exact-tree/index parser output: 2 MiB
- tracked entry count: 20,000
- one path: 4,096 UTF-8 bytes
- one tracked regular file: 32 MiB
- all authenticated tracked bytes: 256 MiB
- each Git subprocess: 10 seconds
- ordinary Git command output: 4 KiB

Per-file 및 aggregate byte budget은 해당 descriptor read와 blob hash를 시작하기 전에 확인한다. 이 Git subprocess 상한은 LLM 추론 timeout과 무관하다.

## Why descriptor-bound local hashing is used

Acquisition source identity는 checkout의 실제 바이트를 특정 immutable commit에 결박해야 한다. `.gitattributes`의 clean filter, end-of-line conversion, pathname 재해석, repository-local helper뿐 아니라 cached stat 또는 concurrently rewritten index도 실제 바이트의 expected identity를 대신할 수 없다.

Noema는 고정된 commit tree에서 expected blob ID를 얻고, `O_NOFOLLOW` descriptor로 읽은 buffer를 Node의 hash 구현에 직접 전달한다. Pathname filter, helper 실행, 두 번째 path open에 의존하지 않는다. Hash 전후 descriptor/path identity와 executable mode는 blob contents와 별도로 검증한다. 정규화된 작업 트리가 commit의 원시 바이트와 다르면 승인하지 않는 기존 계약도 유지한다.

## Conversion regression

Issue #575에서 기존 서로 다른 길이의 fixture가 놓친 실행 경로를 재현했다. 추가된 `test/acquisition_git_conversion_boundary.test.ts`는 `clean/process`, 작업 트리 attributes/info attributes, 동일 바이트 재기록/동일 길이 변경을 교차한다. 각 helper는 임시 `.git` 내부의 marker만 기록한다. 검증 실패 여부뿐 아니라 helper가 아예 실행되지 않았는지 확인한다. Git config도 변경하지 않아야 한다.

같은 suite는 서로 다른 길이 변경, staged 변경, 두 index shortcut과 untracked evidence 보존을 함께 검사한다. Linux/Git 2.47.3/Node 22.16.0에서 original source는 13개 중 8개가 marker 생성으로 실패했고, 변경 후 13개 모두 통과했다. 이는 Vitest 등록 부분을 Node test runner에 맞춘 로컬 focused 실행 결과다. 전체 Vitest, typecheck, coverage, hosted security 결과와 구별한다.

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

## Evidence and trust separation

이 gate의 PASS는 GitHub Checks, 독립 승인, ruleset enforcement, merge compatibility, release provenance, immutable publication, deployment acceptance 또는 고객 성과 증거를 대신하지 않는다. 각 evidence plane은 exact checked SHA와 producer를 별도로 보존한다.

신뢰된 실행 파일, Node runtime, checkout provisioner와 local Git object database는 여전히 전제다. 이 helper 수정만으로 외부에서 받은 임의의 `.git` database를 호스트에서 안전하게 열 수 있다고 주장하지 않는다. 외부 디렉터리의 admission과 자격증명 없는 격리는 별도 runtime 경계에서 선행해야 한다. 추가적인 권한·네트워크 접근을 허용하는 작업에도 사용할 수 없다.

## Operational response

바이트·tree·descriptor 검증에 실패하면 source SHA를 승인하지 않고, 신뢰된 checkout에서 파일과 index를 복구한다. 다른 writer의 branch 이동을 재조회한 뒤 새 exact checkout에서 manifest를 생성하고 integrity, CI, security, coverage, review, provenance를 각각 재검증한다.

변환 helper가 이미 실행된 흔적이 있다면 단순 checkout 복구만으로 종결하지 않는다. 해당 실행 환경을 격리하고 노출 가능 자격증명과 산출물 범위를 조사해야 한다. 감사 오류가 반환되었더라도 선행 side effect가 없었다는 뜻은 아니다.

## References

Git Project. (n.d.). *gitattributes*. https://git-scm.com/docs/gitattributes

Git Project. (n.d.). *git-ls-tree*. https://git-scm.com/docs/git-ls-tree

Git Project. (n.d.). *git-ls-files*. https://git-scm.com/docs/git-ls-files

Git Project. (n.d.). *Racy Git*. https://git-scm.com/docs/racy-git.html

OpenJS Foundation. (n.d.). *File system*. Node.js documentation. https://nodejs.org/api/fs.html

Rosales, F. (2026, September 1). *GitSpawn: A single flaw lets untrusted repos run code in Claude Code, Codex, Cursor, and Grok*. Manifold Security. https://www.manifold.security/blog/ai-coding-agents-git-hijack
