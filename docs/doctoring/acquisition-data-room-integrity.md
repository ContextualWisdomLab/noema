# Doctoring: Acquisition Data-Room Evidence Integrity

## Decision

Noema의 acquisition data-room manifest는 buyer-readiness authority가 아니라 **검증해야 하는 evidence index**다. 최종 판정은 retained artifact bytes, exact Git source identity, optional immutable release identity를 오프라인에서 다시 검증한다. Persisted Boolean과 gap list는 recomputation과 일치해야 하는 cross-check일 뿐 authorization input이 아니다.

외부 링크는 URI 형식만으로 evidence가 되지 않는다. Final-gate external material은 exact source URL, collection time, collector identity, provenance, retained local artifact path, byte count, SHA-256을 담은 bounded local verification receipt와 실제 retained artifact를 함께 검증해야 한다. 이때 receipt path와 retained artifact path는 모두 reviewed catalog가 고정하며, receipt가 canonical하더라도 catalog와 다른 repository file을 artifact로 선택할 수 없다.

## Engineering consequences

- Manifest/receipt JSON은 bounded size, fatal UTF-8, duplicate-key rejection을 적용한다.
- Manifest generator와 integrity audit는 verifier/catalog import 전에 exact `HEAD^{commit}`을 local-only Git으로 해석하고 tracked checkout이 해당 commit과 같은지 확인한다.
- Git preflight는 system/global configuration, hooks, fsmonitor, untracked cache, replacement objects, lazy fetch, terminal prompt를 비활성화하고 bounded stdout/stderr와 timeout을 사용한다.
- `git ls-files -v -z --cached --`를 최대 2 MiB로 bounded read하고, `S` status tag(`skip-worktree`) 또는 lowercase tag(`assume-unchanged`)가 하나라도 있으면 acquisition checkout을 거부한다. 정상 `git diff`가 index hint 때문에 working-tree byte comparison을 생략하는 경로를 trust boundary 밖으로 밀어낸다.
- Index hint inspection은 tracked diff 전후에 반복하며 malformed, unterminated, nonzero, oversized, spawn/signal output을 모두 fail-closed 처리한다. Repository path는 오류에 반사하지 않는다.
- `git diff --quiet --no-ext-diff --no-textconv --ignore-submodules=none <exact-head> --`의 exit 1은 tracked drift로 해석하며, 다른 nonzero/signal/spawn failure는 별도 오류가 아니라 모두 fail-closed preflight failure다.
- Retained evidence를 읽은 뒤 exact HEAD, safe index flags, tracked checkout을 전체 재검증하므로 verification 중 source movement나 index-hint 변경이 success evidence로 기록되지 않는다.
- Intentionally untracked acquisition artifacts는 source commit의 일부라고 주장하지 않으므로 tracked-source preflight가 허용한다. 실제 artifact bytes는 별도의 descriptor-safe evidence policy가 검증한다.
- Local evidence는 repository-relative allowlist와 `O_NOFOLLOW` descriptor를 사용하며 path/descriptor identity를 read 전후에 대조한다.
- SHA-256 및 byte size는 audit 시점의 실제 bytes에서 다시 계산한다.
- Schema, repository, objective, exact source commit, optional release tag/commit, unique entry set을 fail-closed 검증한다.
- External receipt는 reviewed `receiptPath`에서만 읽고, `artifact.path`가 reviewed `artifactPath`와 정확히 일치할 때만 해당 retained bytes를 검증한다. Canonical하지만 다른 경로는 substitution으로 거부한다.
- `passed`, `finalGatePassed`, `missingRequired`, `missingFinalGate`는 모두 trusted recomputation에서 생성한다.
- External collection은 final audit와 분리한다. Final audit는 네트워크를 사용하지 않는다.
- Integrity PASS는 CI, review, security status, merge authority, revenue, deployment 또는 release acceptance를 대신하지 않는다.

## Bootstrap trust root

Working-tree authentication에는 피할 수 없는 bootstrap boundary가 있다. 실행되기 전의 JavaScript가 자기 자신의 무결성을 증명할 수는 없다. 따라서 이 변경은 다음을 trust root로 명시한다.

- protected exact-source checkout을 제공하는 trusted CI/runner 또는 maintainer checkout process;
- 해당 checkout에서 실행되는 Node.js runtime;
- local Git executable과 object database;
- `scripts/acquisition-data-room-manifest-secure.mjs` / `scripts/acquisition-data-room-integrity-audit.mjs` entrypoint;
- 최소 기능만 가진 `scripts/lib/acquisition-git-preflight.mjs`.

이 bootstrap을 통과한 이후에는 heavier verifier/catalog를 dynamic import하기 전에 exact HEAD, unsafe index hints, tracked worktree를 인증하고, evidence read 이후 같은 절차를 다시 인증한다. 따라서 dirty tracked verifier, catalog, README/policy/documentation/control source가 현재 HEAD SHA를 재사용하거나 `skip-worktree`/`assume-unchanged`로 working-tree 차이를 숨겨 exact-commit evidence로 위장하는 경로를 차단한다. Bootstrap 자체의 provenance와 exact source authenticity는 기존 protected branch, CI, release/Sigstore provenance plane이 담당한다. 이 문서는 Git preflight가 cryptographic self-verification을 제공한다고 주장하지 않는다.

## Standards rationale

SLSA v1.2는 2026-08-07 현재 Approved/current specification이며 provenance를 artifact가 어디서, 언제, 어떻게 생성되었는지를 추적할 수 있는 검증 가능한 정보로 정의한다. Verifier는 artifact/provenance를 producer-defined expectations와 대조해야 한다. Noema의 external verification receipt는 SLSA provenance 자체를 주장하지 않지만, source identity·artifact digest·collector/provenance뿐 아니라 reviewed artifact identity를 명시하고 verifier가 retained bytes에 대해 사전 정의된 expectations를 다시 적용한다는 동일한 trust principle을 따른다.

NIST SP 800-218 SSDF v1.1은 현재 finalized normative baseline으로 사용한다. 2025년 공개된 SP 800-218 Rev. 1 / SSDF v1.2는 2026-08-07 현재 Initial Public Draft이므로 이 변경의 normative requirement로 승격하지 않는다. Evidence integrity는 release·acquisition 과정에서 provenance와 verification information을 보존하고 검증하는 secure-development practice를 구체화한다.

RFC 8785 JCS는 cryptographic hashing/signing에서 invariant JSON 표현과 duplicate property name 금지의 중요성을 설명한다. Noema는 이 변경에서 JCS 서명 format을 새로 도입하지 않는다. 대신 JSON parser ambiguity를 줄이기 위해 duplicate decoded object key를 fail-closed 거부하고, 실제 retained artifact bytes 자체를 SHA-256으로 검증한다. 따라서 canonicalization을 사용하지 않는 evidence digest를 JCS-compliant digest라고 과장하지 않는다.

Git의 current primary documentation은 `GIT_CONFIG_GLOBAL=/dev/null` 및 `GIT_CONFIG_NOSYSTEM`을 predictable script environment를 만드는 수단으로 정의하고, `GIT_NO_LAZY_FETCH=1`이 promisor remote에서 missing object를 demand-fetch하지 않게 한다고 명시한다. 또한 `git diff --quiet`은 diff-style exit code를 사용하여 차이가 있으면 1, 없으면 0을 반환하고, `--no-ext-diff`/`--no-textconv`는 external diff/text conversion helper 실행을 차단하며 `--ignore-submodules=none`은 submodule modification을 숨기는 설정을 override한다. 이 변경은 그 documented semantics를 fail-closed exact-checkout preflight에 사용한다.

`git-ls-files`의 current documentation은 `-v`가 status tag를 출력하고 `S`를 `skip-worktree`, lowercase letter를 `assume-unchanged`로 나타낸다고 정의한다. `git-update-index`는 `assume-unchanged`가 설정되면 사용자가 파일을 바꾸지 않았다고 Git이 가정할 수 있고, `skip-worktree`가 working-tree 파일을 up-to-date로 취급하는 동작을 설명한다. 따라서 `git diff` 단독 성공은 acquisition source authentication에 충분하지 않으며, Noema는 diff 전후 bounded NUL-delimited index inspection으로 두 hint를 명시적으로 금지한다.

## Threat model addressed

이 경계는 다음 공격 또는 실수에 대해 fail-closed 하도록 설계했다.

- `finalGatePassed: true` 또는 빈 gap list를 수동으로 작성한 forged manifest
- exact HEAD는 그대로 두고 tracked verifier/catalog/policy/evidence file만 수정한 dirty checkout
- tracked file에 `skip-worktree`를 설정해 modified working-tree bytes가 일반 diff에서 숨겨지는 경우
- tracked file에 `assume-unchanged`를 설정해 Git의 working-tree comparison을 생략시키는 경우
- verification 도중 unsafe index hint, HEAD 또는 tracked worktree가 변경되는 source movement
- local/global Git configuration 또는 external diff/textconv helper를 통해 comparison semantics가 바뀌는 환경 오염
- partial-clone missing object를 remote에서 lazy-fetch하여 offline audit boundary가 깨지는 경우
- manifest 생성 후 local evidence 변경
- same-path symlink 또는 non-regular replacement
- path-to-descriptor replacement 및 read 중 metadata identity drift
- traversal/absolute/backslash/control-character path alias
- duplicate/unknown/missing catalog entry
- stale repository commit 또는 selected release mismatch
- duplicate-key 또는 malformed/oversized JSON
- arbitrary `https://` 문자열을 verified evidence로 오인
- external receipt가 가리키는 retained artifact의 digest/size 변경
- external receipt가 `README.md` 같은 canonical하지만 review되지 않은 다른 repository path를 retained artifact로 대체하는 substitution

이 경계는 cryptographic signature나 trusted timestamp authority를 새로 제공하지 않는다. Release/deployment artifact authenticity는 기존 Sigstore/GitHub attestation 체계가 계속 담당하며, commercial/revenue/transfer evidence의 실재성과 승인 또한 별도 gate가 담당한다.

## APA 7th references

Git Project. (2026). *Git documentation: git*. https://git-scm.com/docs/git

Git Project. (2026). *Git documentation: git-diff*. https://git-scm.com/docs/git-diff

Git Project. (2026). *Git documentation: git-ls-files*. https://git-scm.com/docs/git-ls-files

Git Project. (2026). *Git documentation: git-update-index*. https://git-scm.com/docs/git-update-index

National Institute of Standards and Technology. (2022). *Secure software development framework (SSDF) version 1.1: Recommendations for mitigating the risk of software vulnerabilities* (NIST Special Publication 800-218). https://doi.org/10.6028/NIST.SP.800-218

Rundgren, A., Jordan, B., & Erdtman, S. (2020). *JSON canonicalization scheme (JCS)* (RFC 8785). RFC Editor. https://doi.org/10.17487/RFC8785

SLSA Community. (2026). *SLSA specification version 1.2*. Open Source Security Foundation. https://slsa.dev/spec/v1.2/

SLSA Community. (2026). *Provenance*. In *SLSA specification version 1.2*. Open Source Security Foundation. https://slsa.dev/spec/v1.2/provenance

## Non-normative draft tracking

Booth, H., Ogata, M., Kent, K., Souppaya, M., & Dodson, D. (2025). *Secure software development framework (SSDF) version 1.2: Recommendations for mitigating the risk of software vulnerabilities* (NIST SP 800-218 Rev. 1, Initial Public Draft). National Institute of Standards and Technology. https://csrc.nist.gov/pubs/sp/800/218/r1/ipd

The draft above is tracked for future review only. It does not replace the finalized NIST SP 800-218 v1.1 baseline in this change.
