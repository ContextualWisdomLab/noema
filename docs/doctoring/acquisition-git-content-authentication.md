# Doctoring: Acquisition Git Descriptor-Bound Content Authentication

## Decision

Noema의 acquisition exact-checkout preflight는 cached stat equality나 `git diff-files` success를 tracked-byte authority로 사용하지 않는다. Stage-zero index가 선언한 Git blob object ID와 `O_NOFOLLOW` descriptor에서 읽은 current checkout bytes로 다시 계산한 object ID가 정확히 같아야 한다.

Ordinary Git comparison은 staged mode/state와 일반적인 worktree drift를 빠르게 찾는 defense in depth로 유지한다. 최종 content 판정은 pathname을 다시 여는 Git 명령이 아니라, 검증된 descriptor가 제공한 bounded buffer를 `git hash-object --stdin`으로 계산하는 방식이다.

## Why cached stat equality is insufficient

Git index는 working tree 비교를 빠르게 하기 위해 `lstat(2)`에서 얻은 type, executable bits, timestamps, inode, size 같은 metadata를 저장한다. Git의 공식 racy-git 문서는 같은 size를 유지한 빠른 in-place modification에서 cached stat information이 실제 file과 같아 보여 내용이 달라도 unmodified로 오판될 수 있음을 설명한다.

Repository-local `core.trustctime=false`와 `core.checkStat=minimal`은 이 범위를 더 약하게 만들 수 있다. Command-scoped `core.trustctime=true`, `core.checkStat=default`, `core.ignoreStat=false`, `core.filemode=true`는 defense in depth지만 raw bytes의 독립 인증을 대체하지 않는다. Acquisition evidence는 “일반 개발 상황에서 변경을 찾는다”가 아니라 “이 exact checkout의 bytes와 executable mode가 index object와 같다”는 강한 명제를 요구한다.

## Test-first evidence

첫 RED fixture는 repository-local relaxed stat 설정, same-size content replacement, restored modification time을 구성한 뒤 ordinary `git diff-files --quiet`이 clean을 반환하는 precondition을 확인했다. Raw verifier는 반드시 index blob mismatch를 반환해야 한다.

후속 RED fixtures는 다음 경계를 추가했다.

- invalid UTF-8 path bytes가 filesystem resolution 전에 거부됨;
- regular file이 `O_NOFOLLOW` descriptor로 열리고 그 descriptor bytes만 hash됨;
- path와 opened descriptor의 identity가 다르면 read 전에 실패함;
- descriptor size 이후 growth 또는 short read가 hash 전에 실패함;
- index executable mode와 filesystem mode가 독립적으로 비교됨;
- no-follow support가 없으면 fallback 없이 실패함;
- descriptor-bound link-target read가 없는 tracked symlink는 unsupported mode로 실패함.

Production 구현은 이 RED contract를 만족하도록 binary index parsing과 descriptor-bound hashing을 사용한다.

## Authoritative algorithm

### Index identity

`git ls-files --stage -z --cached --`를 binary output으로 읽는다. Header는 ASCII mode/object/stage grammar로 검증하고 path bytes는 fatal UTF-8 decoder로 해석한다. Replacement character를 넣어 별도 path를 같은 문자열로 축약하지 않는다.

Noema는 다음을 거부한다.

- 20,000개 초과 entry 또는 2 MiB 초과 index/path budget;
- stage 1–3 unmerged entry;
- `100644`와 `100755` 외 mode;
- symbolic link, gitlink, sparse-directory representation;
- repository root 또는 상위 경로로 resolve되는 path;
- 4,096 UTF-8 byte 초과 path;
- malformed, non-ASCII header, invalid UTF-8, unterminated output.

### Descriptor-bound byte identity

각 regular file에 대해 다음을 수행한다.

1. Path를 `lstat`하고 real regular file인지 확인한다.
2. `O_RDONLY | O_NOFOLLOW`로 연다.
3. `fstat`과 pre-open path metadata의 device, inode, mode, size, mtime, ctime을 비교한다.
4. index `100644`/`100755`와 owner-execute bit를 독립 비교한다.
5. per-file 32 MiB 및 remaining aggregate 256 MiB budget을 read 전에 확인한다.
6. `size + 1` buffer로 descriptor를 읽어 growth를 감지한다.
7. short read, invalid count 또는 extra byte를 거부한다.
8. read 후 descriptor와 path metadata를 다시 비교한다.
9. Descriptor를 닫은 뒤 exact buffer를 `git hash-object --stdin`으로 blob hash한다.
10. 40자리 SHA-1 또는 64자리 SHA-256 object ID를 index와 exact-match한다.

Node.js 문서가 정의한 `O_NOFOLLOW`는 final path component가 symbolic link이면 open을 실패시키며, `fstatSync`와 `readSync`는 열린 descriptor에 대한 metadata와 bytes를 제공한다. 이 조합은 pre-check와 hash 사이에 pathname을 두 번 여는 경로를 제거한다. Parent-directory concurrent mutation까지 원자적으로 봉쇄한다고 과장하지 않으며, protected runner/checkout provisioning을 bootstrap trust boundary로 둔다.

### Resource boundaries

- index output: 2 MiB;
- entry count: 20,000;
- path: 4,096 UTF-8 bytes;
- file: 32 MiB;
- aggregate: 256 MiB;
- Git subprocess: 10 seconds;
- ordinary Git output: 4 KiB.

Per-file와 aggregate budget은 descriptor read 및 hash 전에 적용한다.

## Trust boundary

`spawnSyncImpl`은 deterministic unit test seam이다. Production manifest generator와 integrity audit는 default trusted Git executable을 사용하고 descriptor-bound raw pass를 실행한다. Hostile privileged process가 filesystem과 Git executable을 동시에 조작하는 상황, kernel compromise, malicious object database는 해결한다고 주장하지 않는다. Trusted runner/checkout provisioner, Node runtime, Git executable/local object database는 bootstrap trust root이며 protected branch, exact-head CI, provenance와 release attestation이 상위 authenticity plane을 담당한다.

## Evidence-plane separation

Raw tracked-byte PASS는 CI, GitHub check run, commit status, review, model judgement, branch ruleset, provenance, release, deployment 또는 buyer commercial evidence를 승인하지 않는다. 각 plane의 exact SHA, producer, timestamp, authority를 별도로 검증한다.

## APA 7th references

Git Project. (2026). *Git documentation: git-hash-object*. https://git-scm.com/docs/git-hash-object

Git Project. (2026). *Git documentation: git-ls-files*. https://git-scm.com/docs/git-ls-files

Git Project. (2026). *Racy Git*. https://git-scm.com/docs/racy-git.html

OpenJS Foundation. (2026). *File system*. Node.js documentation. https://nodejs.org/api/fs.html
