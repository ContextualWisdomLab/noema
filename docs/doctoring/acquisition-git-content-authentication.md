# Doctoring: Acquisition Git Descriptor-Bound Content Authentication

## Decision

Noema의 acquisition exact-checkout preflight는 cached stat equality, `git diff-files` success, 또는 mutable stage-zero index object ID를 tracked-byte authority로 사용하지 않는다. 이미 고정한 exact `HEAD` commit tree가 선언한 Git blob object ID와 `O_NOFOLLOW` descriptor에서 읽은 current checkout bytes로 다시 계산한 object ID가 정확히 같아야 한다.

Ordinary Git comparison은 staged mode/state와 일반적인 worktree drift를 빠르게 찾는 defense in depth로 유지한다. 최종 content 판정은 pathname을 다시 여는 Git 명령이나 mutable index가 아니라, exact commit tree와 검증된 descriptor가 제공한 bounded buffer를 결합해 수행한다.

## Why cached stat equality and mutable index identity are insufficient

Git index는 working tree 비교를 빠르게 하기 위해 `lstat(2)`에서 얻은 type, executable bits, timestamps, inode, size 같은 metadata를 저장한다. Git의 공식 racy-git 문서는 같은 size를 유지한 빠른 in-place modification에서 cached stat information이 실제 file과 같아 보여 내용이 달라도 unmodified로 오판될 수 있음을 설명한다.

Repository-local `core.trustctime=false`와 `core.checkStat=minimal`은 이 범위를 더 약하게 만들 수 있다. Command-scoped `core.trustctime=true`, `core.checkStat=default`, `core.ignoreStat=false`, `core.filemode=true`는 defense in depth지만 raw bytes의 독립 인증을 대체하지 않는다.

또한 index는 commit object와 달리 local mutable state다. `git diff --cached <exactHead>`가 끝난 뒤 다른 local writer가 index와 worktree를 함께 다시 쓰면, 후속 raw-byte pass가 다시 `git ls-files --stage`에서 expected object ID를 읽는 구조는 tampered bytes와 tampered index가 서로 일치한다는 이유로 exact commit identity를 잃을 수 있다. 따라서 acquisition evidence의 expected object ID는 mutable index가 아니라 처음 인증한 exact commit tree에서 파생해야 한다.

## Test-first evidence

첫 RED fixture는 repository-local relaxed stat 설정, same-size content replacement, restored modification time을 구성한 뒤 ordinary `git diff-files --quiet`이 clean을 반환하는 precondition을 확인했다. Raw verifier는 반드시 blob mismatch를 반환해야 한다.

후속 RED fixtures는 다음 경계를 추가했다.

- invalid UTF-8 path bytes가 filesystem resolution 전에 거부됨;
- regular file이 `O_NOFOLLOW` descriptor로 열리고 그 descriptor bytes만 hash됨;
- path와 opened descriptor의 identity가 다르면 read 전에 실패함;
- descriptor size 이후 growth 또는 short read가 hash 전에 실패함;
- executable mode와 filesystem mode가 독립적으로 비교됨;
- no-follow support가 없으면 fallback 없이 실패함;
- descriptor-bound link-target read가 없는 tracked symlink는 unsupported mode로 실패함;
- exact HEAD를 고정한 뒤 index와 worktree를 같은 tampered blob으로 다시 써도 raw verifier가 immutable HEAD-tree blob과의 불일치를 거부함.

Production 구현은 이 RED contract를 만족하도록 exact-tree inventory와 descriptor-bound hashing을 사용한다.

## Authoritative algorithm

### Immutable exact-tree identity

Preflight는 `HEAD^{commit}`을 먼저 40자리 exact SHA로 고정한다. Staged/index hygiene는 `git diff --cached`와 index-hint inspection으로 별도 확인하지만, raw-byte expected identity는 `git ls-tree -r --full-tree -z <exactHead>`에서 가져온다. Git의 공식 `git-ls-tree` 문서는 `--full-tree`가 current working directory에 의한 listing 축소를 제거하며, `-z`가 pathname을 quoting 없이 verbatim bytes와 NUL terminator로 출력하고, `--format`이 `%(objectmode)`, `%(objectname)`, `%(path)` 및 `%x09` 같은 byte interpolation을 지원한다고 정의한다.

Noema는 exact-tree record를 기존 bounded binary parser의 mode/object/stage-shaped grammar로 formatting하되 stage field는 상수 `0`으로 합성한다. Object ID와 mode는 exact commit tree에서만 온다. 이로써 raw-byte pass가 mutable index object ID를 재신뢰하지 않는다.

다음을 거부한다.

- 20,000개 초과 entry 또는 2 MiB 초과 tree/path budget;
- `100644`와 `100755` 외 mode;
- symbolic link, gitlink, sparse-directory representation;
- repository root 또는 상위 경로로 resolve되는 path;
- 4,096 UTF-8 byte 초과 path;
- malformed, non-ASCII header, invalid UTF-8, unterminated output;
- exact HEAD tree object ID와 descriptor-derived blob hash의 불일치.

### Descriptor-bound byte identity

각 regular file에 대해 다음을 수행한다.

1. Path를 `lstat`하고 real regular file인지 확인한다.
2. `O_RDONLY | O_NOFOLLOW`로 연다.
3. `fstat`과 pre-open path metadata의 device, inode, mode, size, mtime, ctime을 비교한다.
4. exact-tree `100644`/`100755`와 owner-execute bit를 독립 비교한다.
5. per-file 32 MiB 및 remaining aggregate 256 MiB budget을 read 전에 확인한다.
6. `size + 1` buffer로 descriptor를 읽어 growth를 감지한다.
7. short read, invalid count 또는 extra byte를 거부한다.
8. read 후 descriptor와 path metadata를 다시 비교한다.
9. Descriptor를 닫은 뒤 exact buffer를 `git hash-object --stdin`으로 blob hash한다.
10. 40자리 SHA-1 또는 64자리 SHA-256 object ID를 exact HEAD tree object ID와 exact-match한다.

Node.js 문서가 정의한 `O_NOFOLLOW`는 final path component가 symbolic link이면 open을 실패시키며, `fstatSync`와 `readSync`는 열린 descriptor에 대한 metadata와 bytes를 제공한다. 이 조합은 pre-check와 hash 사이에 pathname을 두 번 여는 경로를 제거한다. Parent-directory concurrent mutation까지 원자적으로 봉쇄한다고 과장하지 않으며, protected runner/checkout provisioning을 bootstrap trust boundary로 둔다.

### Resource boundaries

- exact-tree/parser output: 2 MiB;
- entry count: 20,000;
- path: 4,096 UTF-8 bytes;
- file: 32 MiB;
- aggregate: 256 MiB;
- Git subprocess: 10 seconds;
- ordinary Git output: 4 KiB.

Per-file와 aggregate budget은 descriptor read 및 hash 전에 적용한다.

## Trust boundary

`spawnSyncImpl`은 deterministic unit test seam이다. Production manifest generator와 integrity audit는 default trusted Git executable을 사용하고, preflight가 처음 인증한 exact SHA를 raw verifier에 명시적으로 전달해 immutable tree inventory와 descriptor-bound raw pass를 실행한다. Hostile privileged process가 filesystem과 Git executable/local object database를 동시에 조작하는 상황, kernel compromise, malicious object database는 해결한다고 주장하지 않는다. Trusted runner/checkout provisioner, Node runtime, Git executable/local object database는 bootstrap trust root이며 protected branch, exact-head CI, provenance와 release attestation이 상위 authenticity plane을 담당한다.

## Evidence-plane separation

Raw tracked-byte PASS는 CI, GitHub check run, commit status, review, model judgement, branch ruleset, provenance, release, deployment 또는 buyer commercial evidence를 승인하지 않는다. 각 plane의 exact SHA, producer, timestamp, authority를 별도로 검증한다.

## APA 7th references

Git Project. (2026). *Git documentation: git-hash-object*. https://git-scm.com/docs/git-hash-object

Git Project. (2026). *Git documentation: git-ls-tree*. https://git-scm.com/docs/git-ls-tree

Git Project. (2026). *Git documentation: git-ls-files*. https://git-scm.com/docs/git-ls-files

Git Project. (2026). *Racy Git*. https://git-scm.com/docs/racy-git.html

OpenJS Foundation. (2026). *File system*. Node.js documentation. https://nodejs.org/api/fs.html
