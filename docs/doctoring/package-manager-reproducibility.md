# 패키지 관리자 재현성 계약

## 결정

Noema의 검토·CI·lockfile 재생성 기준 개발 도구 체인은 **Node.js 24.18.0 + npm 11.16.0**으로 고정한다. `package.json`의 `packageManager`는 검토된 npm identity를 선언하고, `devEngines.runtime`과 `devEngines.packageManager`는 각각 정확한 Node/npm 버전을 `onFail: "error"`로 요구한다. CI는 `actions/setup-node`의 immutable action commit을 유지하면서 `node-version: "24.18.0"`을 사용하고, `npm ci`보다 먼저 실제 `node --version`과 `npm --version`을 exact-match로 검증한다.

`engines.node >=22`는 Noema 자체의 지원 runtime 범위이므로 유지한다. 개발·lockfile 생성 도구 체인과 제품 runtime compatibility는 별도 계약이다. 따라서 더 넓은 지원 runtime 범위를 보존하면서도, 동일 lockfile을 생성·검토하는 도구는 하나의 재현 가능한 identity로 좁힌다.

## 왜 `packageManager`만으로 충분하지 않은가

npm의 `packageManager` 표시는 사람과 tooling에 package-manager identity를 전달하는 provenance metadata로 유용하지만, Noema의 실패-폐쇄 경계는 그것만 신뢰하지 않는다. npm의 `devEngines`는 `install`, `ci`, `run` 전에 개발 runtime/package-manager를 검사할 수 있고 `onFail: "error"`로 mismatch를 종료시킬 수 있다. CI는 여기에 독립적인 exact version shell gate를 추가해, runner image나 Node major selector가 시간이 지나며 다른 bundled npm을 제공해도 install 전에 중단한다.

Node.js 24.18.0의 공식 release record는 이 배포판이 npm 11.16.0을 포함함을 명시한다. 따라서 CI는 별도 `npm install -g` bootstrap이나 mutable latest tag 없이 검토된 Node 배포판 자체의 npm을 사용한다.

## Lockfile 재생성 절차

1. `node --version`이 정확히 `v24.18.0`, `npm --version`이 정확히 `11.16.0`인지 확인한다. mismatch이면 lockfile을 생성하지 않는다.
2. 기존 `package-lock.json`을 기준 증거로 보존한다. `npm ci`는 frozen install 확인에 사용하며 lockfile을 수정하는 복구 수단으로 사용하지 않는다.
3. 필요한 dependency만 대상으로 lockfile update를 수행한다. 보안 remediation처럼 목표 package가 명확하면 그 package와 필수 graph movement 외의 metadata 변경을 정상화라는 이유만으로 자동 승인하지 않는다.
4. `git diff -- package-lock.json`에서 목표 package 밖의 `version`, `resolved`, `integrity`, `license`, `bin`, dependency edge 또는 기타 metadata가 바뀌면 각각 upstream registry/package source 또는 package-manager semantics에 근거한 source-level justification이 있어야 한다. 근거가 없으면 regeneration을 폐기하고 원인을 조사한다.
5. 최종 exact head에서 `npm ci`, `npm audit --audit-level=high`, repository CI, Security Scan, reviewer-ci, packaging/provenance/release acceptance를 다시 실행한다. 이전 head의 성공은 재사용하지 않는다.

PR #76에서 npm 11.16.0 regeneration이 의도한 `nanoid` 변경 외에 `@esbuild/*`, `@img/sharp-win32-x64`, Wrangler metadata를 다시 기록한 사례가 이 계약의 직접 동기다. Green install/audit만으로 lockfile diff의 최소성이나 provenance가 입증되지는 않는다.

## Lockfile 변경 증거 계약

CI의 lockfile change-control은 경로 이름만 허용하는 allowlist가 아니다. 변경이 존재하면 `.github/lockfile-change-policy.json`의 **schema version 2**가 현재 pull request의 exact base SHA, 변경된 `packages` key의 정확한 집합, 그리고 각 key의 변경 전·후 package object를 canonical JSON으로 직렬화한 SHA-256을 모두 결합해야 한다. Object key 순서는 digest 의미에 영향을 주지 않지만 array 순서와 실제 값은 보존한다. package 생성·삭제는 `undefined`를 JSON `null`과 구분하는 presence envelope로 해시하여 graph movement 자체도 명시적으로 검토한다.

`package-lock.json`, exact-base lock snapshot, lockfile policy는 모두 **decoded object key가 유일한 JSON**이어야 한다. JSON parser가 마지막 값을 선택하는 중복-key 입력은 사람에게 보이는 text와 실제 검증 값 사이에 ambiguity를 만들 수 있으므로 실패-폐쇄한다. `baseSha`와 `base\u0053ha`처럼 escape decoding 후 같은 key가 되는 표현도 동일한 중복으로 취급하며, malformed·oversized·invalid UTF-8 입력과 같은 신뢰 경계에서 거부한다.

이 digest는 승인 권한이나 취약점 예외가 아니다. `version`만 기대한 보안 업데이트에서 `resolved`, `integrity`, `license`, `bin`, dependency edge 또는 다른 package metadata가 바뀌면 같은 package path 안의 변화라도 digest가 달라져 기존 정책은 실패한다. 따라서 검토자가 확인하지 않은 registry URL·SRI·metadata가 목표 package 경로에 섞이는 path-only approval 문제를 차단한다. 정책은 exact base SHA가 달라지거나 package object가 한 byte의 의미 차이라도 달라지면 새 증거로 재생성·재검토해야 하며, source URL과 justification 역시 별도 bounded provenance evidence로 유지한다.

정책은 CI가 이미 체크아웃한 exact head를 검증하는 retained evidence일 뿐 GitHub review, required check, branch protection, provenance, release acceptance 또는 deployment authority를 대체하지 않는다. stale-head 정책, 이전 base SHA 정책, 미등록 package 변화, malformed digest, top-level lock metadata 변화는 모두 실패-폐쇄한다.

## 불변 조건

- CI 또는 GitHub Actions가 lockfile이나 PR branch를 스스로 고치지 않는다.
- `.github/workflows/repair-*`, self-modifying workflow, `contents: write` repair path를 만들지 않는다.
- `npm ci`의 frozen-install semantics와 `npm audit --audit-level=high`를 완화하지 않는다.
- Node/npm identity mismatch는 install 전에 실패한다.
- package-manager 변경은 별도 reviewed change로 취급하며, lockfile regeneration과 exact-head evidence를 다시 만든다.
- dependency-security remediation에서 무관한 lock metadata churn은 명시적 source-level justification 없이는 수용하지 않는다.
- lockfile change policy는 exact base와 exact before/after package metadata를 결합하며, 경로 allowlist만으로 변경을 승인하지 않는다.
- lockfile·base snapshot·policy JSON은 escape decoding 이후에도 object key가 유일해야 하며 duplicate-key ambiguity는 실패-폐쇄한다.

## 근거

npm은 `package-lock.json`을 정확한 dependency tree를 기록해 팀·배포·CI가 같은 tree를 설치하도록 하는 파일로 정의하고, `npm ci`가 package manifest와 lockfile이 불일치하면 수정하지 않고 실패하며 lockfile에 쓰지 않는 frozen install 경로임을 명시한다. 또한 `devEngines`가 source tree에서 작업하는 개발자의 runtime/package manager를 통제하고 `install`, `ci`, `run` 전에 평가된다고 문서화한다. Node.js 공식 24.18.0 release record는 bundled npm을 11.16.0으로 고정해 본 계약의 독립적인 distribution provenance를 제공한다.

Lockfile policy의 SHA-256은 변경 증거를 exact package metadata에 결합하기 위한 repository-owned control이다. SHA-256 자체의 보안 속성은 NIST FIPS 180-4의 Secure Hash Standard에 근거하며, 이 digest는 package provenance를 독립적으로 증명하는 것이 아니라 검토된 exact before/after 값과 CI 입력의 불일치를 탐지하는 결합 값으로만 사용한다.

## 참고문헌

National Institute of Standards and Technology. (2015). *Secure Hash Standard (SHS) (FIPS PUB 180-4)*. U.S. Department of Commerce. https://doi.org/10.6028/NIST.FIPS.180-4

Node.js. (2026, June 23). *Node.js 24.18.0 (LTS)*. OpenJS Foundation. https://nodejs.org/en/blog/release/v24.18.0

npm, Inc. (2026). *npm ci*. npm Docs. Retrieved August 8, 2026, from https://docs.npmjs.com/cli/v11/commands/npm-ci/

npm, Inc. (2026). *package-lock.json*. npm Docs. Retrieved August 8, 2026, from https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json/

npm, Inc. (2026). *package.json*. npm Docs. Retrieved August 8, 2026, from https://docs.npmjs.com/cli/configuring-npm/package-json/
