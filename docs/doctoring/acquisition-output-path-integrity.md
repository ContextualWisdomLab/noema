# Doctoring: Acquisition Output Path Integrity

## Decision

Noema의 acquisition manifest와 integrity-audit output은 retained evidence이므로 leaf path만 안전해도 충분하지 않다. Output leaf의 모든 **이미 존재하는 parent component**가 실제 directory이며 symbolic link가 아님을 확인한 뒤에만 recursive directory creation과 descriptor-safe write를 허용한다. Leaf write는 기존 `O_NOFOLLOW`, single-link regular-file, descriptor/path identity, owner-only `0600` 계약을 유지한다.

이 통제는 buyer-facing evidence가 의도한 data-room subtree 밖으로 redirect되어 다른 filesystem object를 생성·truncate하는 것을 막기 위한 것이다. 단, Node.js의 pathname 기반 filesystem API만으로 hostile concurrent actor가 parent component를 검사 직후 교체하는 race까지 원자적으로 제거한다고 주장하지 않는다. 그런 동시 filesystem mutation은 protected checkout/runner provisioning이라는 bootstrap trust root가 통제해야 하며, Noema의 이 경계는 pre-existing parent link/substitution을 fail-closed 차단한다.

## Threat model

다음 경로를 현재 acquisition evidence boundary의 공격·오구성 사례로 간주한다.

- `linked-output/data-room-manifest.json`에서 `linked-output`이 다른 directory를 가리키는 symbolic link인 경우
- `NOEMA_DATA_ROOM_MANIFEST_PATH`의 intermediate parent가 symbolic link인 경우
- integrity audit의 configured output directory가 symbolic link인 경우
- parent component가 directory가 아닌 regular file, device, socket 등인 경우
- leaf 자체가 symbolic link, hard-linked regular file 또는 non-regular object인 경우

`O_NOFOLLOW`는 최종 path component의 symbolic link를 차단하지만 parent-directory link resolution까지 금지하는 계약이 아니다. 따라서 leaf-only protection은 위 parent traversal 경계를 충족하지 않는다.

## Implementation invariant

`scripts/lib/acquisition-private-output.mjs`의 `assertAcquisitionPrivatePathParents()`는 output leaf의 parent부터 filesystem root까지 올라가며 각 existing component를 `lstat`한다. 존재하는 component는 `isDirectory() === true`이고 `isSymbolicLink() === false`여야 한다. 아직 존재하지 않는 intermediate directory는 허용하지만 더 높은 existing ancestor 검사는 중단하지 않는다.

Manifest와 integrity-audit entrypoint는 recursive `mkdir` 전에 parent chain을 검사하고 directory 생성 후 다시 검사한다. 이후 `writeAcquisitionPrivateFile()`이 동일 parent boundary를 다시 검사하고 leaf를 descriptor-safe 방식으로 연다. 따라서 pre-existing parent symlink를 통해 `mkdir` 또는 write가 다른 subtree로 redirect되는 경로를 test-first 회귀로 고정한다.

## Verification requirements

현실 회귀 테스트는 최소 다음을 보장해야 한다.

- parent symlink를 통한 새 leaf 생성이 실패하고 target directory에 파일이 생기지 않는다.
- parent symlink를 통한 기존 target overwrite가 실패하고 sentinel bytes가 변하지 않는다.
- manifest entrypoint의 symlink output directory와 explicit manifest parent가 exit code `1`로 실패한다.
- audit entrypoint의 symlink output directory가 exit code `1`로 실패하며 target leaf를 만들지 않는다.
- missing intermediate directory는 정상적인 safe ancestor chain 아래에서 허용된다.
- parent metadata가 symbolic link 또는 non-directory이면 fail-closed이다.
- production statement·branch·function·line coverage는 100%를 유지한다.

## Standards and primary-source rationale

Node.js의 `fs.lstat()`는 symbolic link가 가리키는 target이 아니라 link 자체의 정보를 반환한다. 또한 `O_NOFOLLOW`는 `open()`의 최종 path가 symbolic link일 때 실패하도록 하는 POSIX flag이며, Node.js는 일부 POSIX-specific constants가 모든 운영체제에서 제공되지는 않는다고 명시한다. 따라서 Noema는 parent component 검사에는 `lstat`를 사용하고, leaf에는 `O_NOFOLLOW`를 유지하며 해당 flag가 없는 플랫폼에서 unsafe fallback을 사용하지 않는다.

MITRE CWE-59는 link resolution으로 인해 의도하지 않은 resource에 접근하는 문제를 “Improper Link Resolution Before File Access (‘Link Following’)”로 분류한다. Noema의 parent-chain 검사와 leaf no-follow 경계는 이 weakness class의 pathname redirection 위험을 줄이는 방어다. 이 조치는 path-race 전반을 완전히 제거하는 원자적 capability API라고 주장하지 않는다.

NIST SP 800-218 SSDF v1.1은 secure software development에서 보안 요구사항을 설계·구현·검증하고, 소프트웨어 release의 무결성을 보호하며, 발견된 취약점을 지속적으로 대응하도록 요구하는 finalized baseline이다. 이 변경은 buyer evidence 생성 경로의 trust boundary를 명시하고 test-first로 검증함으로써 그 secure-development 원칙을 적용한다. SP 800-218 Rev. 1 / SSDF v1.2는 2025년 12월 17일 Initial Public Draft로 공개되었으며 finalized normative baseline으로 취급하지 않는다.

## APA 7th references

MITRE. (2026). *CWE-59: Improper link resolution before file access (‘link following’).* Common Weakness Enumeration. https://cwe.mitre.org/data/definitions/59.html

National Institute of Standards and Technology. (2022). *Secure software development framework (SSDF) version 1.1: Recommendations for mitigating the risk of software vulnerabilities* (NIST Special Publication 800-218). https://doi.org/10.6028/NIST.SP.800-218

OpenJS Foundation. (2026). *File system*. Node.js documentation. https://nodejs.org/api/fs.html

## Non-normative draft tracking

Booth, H., Ogata, M., Kent, K., Souppaya, M., & Dodson, D. (2025). *Secure software development framework (SSDF) version 1.2: Recommendations for mitigating the risk of software vulnerabilities* (NIST SP 800-218 Rev. 1, Initial Public Draft). National Institute of Standards and Technology. https://csrc.nist.gov/pubs/sp/800/218/r1/ipd
