# 패키지 관리자 재현성 계약

## 결정

Noema의 검토·CI·lockfile 재생성 기준 개발 도구 체인은 **Node.js 24.19.0 + npm 11.17.0**으로 고정한다. `package.json`의 `packageManager`는 검토된 npm identity를 선언하고, `devEngines.runtime`과 `devEngines.packageManager`는 각각 정확한 Node/npm 버전을 `onFail: "error"`로 요구한다. CI는 Node 24 native JavaScript runtime을 사용하는 `actions/checkout` 6.0.2와 `actions/setup-node` 6.4.0의 immutable full commit SHA를 사용하면서 `node-version: "24.19.0"`을 고정하고, `npm ci`보다 먼저 실제 `node --version`과 `npm --version`을 exact-match로 검증한다.

`engines.node >=22`는 Noema 자체의 지원 runtime 범위이므로 유지한다. 개발·lockfile 생성 도구 체인과 제품 runtime compatibility는 별도 계약이다. 따라서 더 넓은 지원 runtime 범위를 보존하면서도, 동일 lockfile을 생성·검토하는 도구는 하나의 재현 가능한 identity로 좁힌다.

## 왜 `packageManager`만으로 충분하지 않은가

npm의 `packageManager` 표시는 사람과 tooling에 package-manager identity를 전달하는 provenance metadata로 유용하지만, Noema의 실패-폐쇄 경계는 그것만 신뢰하지 않는다. npm의 `devEngines`는 `install`, `ci`, `run` 전에 개발 runtime/package-manager를 검사할 수 있고 `onFail: "error"`로 mismatch를 종료시킬 수 있다. CI는 여기에 독립적인 exact version shell gate를 추가해, runner image나 Node selector가 시간이 지나며 다른 bundled npm을 제공해도 install 전에 중단한다.

Node.js의 immutable `v24.19.0` release tag에서 `deps/npm/package.json`은 bundled npm을 **11.17.0**으로 기록하며, `actions/setup-node`가 제공한 exact 24.19.0 distribution도 CI에서 실제 `npm --version` 11.17.0을 보고했다. release 준비 commit의 중간 tree에 보이는 더 새로운 npm source는 최종 release tag의 distribution identity로 사용하지 않는다. 검증 기준은 immutable release tag와 실제 setup-node distribution의 일치다. 따라서 CI는 별도 `npm install -g` bootstrap이나 mutable latest tag 없이 검토된 Node 배포판 자체의 npm을 사용한다.

CI JavaScript action runtime도 제품 toolchain과 별도의 supply-chain 입력으로 취급한다. GitHub의 checkout v5부터 Node 24 runtime을 사용하며, checkout v6는 그 계열의 credential-handling 개선을 포함한다. setup-node v5도 Node 24 runtime으로 전환되었고 현재 검토 기준은 v6.4.0이다. 따라서 Node 20 대상인 checkout v4.2.2/setup-node v4.4.0을 runner가 강제로 Node 24에서 실행하도록 의존하지 않고, Node 24를 네이티브 대상으로 배포한 action release를 full commit SHA로 고정한다.

## Install-script 실행 정책

Noema는 `.npmrc`의 `strict-allow-scripts=true`와 `package.json`의 exact-version `allowScripts`를 함께 사용한다. 현재 실행이 승인된 install-script identity는 `esbuild@0.28.1`과 `workerd@1.20260625.1`뿐이다. `fsevents@2.3.3`은 **명시적 deny (`false`)** 이며 실행 권한이 아니다. `npm ci`가 이 정책에 포함되지 않은 실행 가능한 dependency lifecycle script를 발견하면 설치 자체가 실패해야 한다. `--dangerously-allow-all-scripts`, blanket `ignore-scripts`, 이름만 사용하는 광범위 승인, CI 전용 우회는 허용하지 않는다.

이 정책은 실제로 실행될 수 있는 dependency script를 최소 권한으로 통제하기 위한 것이다. esbuild의 install path는 platform-specific binary를 확인·준비하며 공식 v0.28.x source/release history에는 fallback download integrity 검증이 포함되어 있다. Cloudflare `workerd`의 공식 release pipeline은 npm wrapper의 `install.js`를 repository source `npm/lib/node-install.ts`에서 빌드하며, 해당 source는 정상 경로에서 platform optional dependency를 해석하고 binary version을 검증한다. optional binary가 없을 때만 npm/HTTPS fallback을 시도한다. 따라서 두 package의 exact reviewed versions만 `true`로 승인하고 버전 이동 시 정책과 upstream source를 다시 검토한다.

npm 11.16.0/11.17.0 계열의 초기 `strict-allow-scripts` preflight는 Linux에서 실제로 설치되지 않는 macOS-only optional dependency `fsevents@2.3.3`도 미검토 install script로 보고할 수 있다. npm 11.17.0 source에서 policy verdict `false`는 rebuild queue에 들어가기 전에 해당 node의 lifecycle script 실행을 차단하며, strict preflight에서도 explicit deny는 reviewed policy decision으로 처리된다. 따라서 CI를 녹색으로 만들기 위해 `fsevents`를 `true`로 승인하지 않고 **exact version을 명시적으로 deny**한다. 이는 executable authority를 확대하지 않으며, macOS에서도 해당 native install script를 실행하지 않는 보수적 정책이다.

npm 11.18.0은 이후 `node.inert` optional dependency를 strict preflight에서 제외하는 수정(`arborist: don't flag inert optional deps in strict-allow-scripts`)을 포함한다. 그러나 Node.js 24.19.0의 최종 release distribution은 npm 11.17.0이므로, Noema는 npm만 별도로 mutable registry bootstrap하여 distribution provenance를 분리하는 대신 현재 bundled npm과 explicit deny를 선택한다. 향후 Node 24 LTS release가 해당 수정이 포함된 npm을 공식적으로 bundle하면 toolchain을 하나의 reviewed change로 올리고 `fsevents` deny의 필요성을 재검토한다.

## Lockfile 재생성 절차

1. `node --version`이 정확히 `v24.19.0`, `npm --version`이 정확히 `11.17.0`인지 확인한다. mismatch이면 lockfile을 생성하지 않는다.
2. 기존 `package-lock.json`을 기준 증거로 보존한다. `npm ci`는 frozen install 확인에 사용하며 lockfile을 수정하는 복구 수단으로 사용하지 않는다.
3. 필요한 dependency만 대상으로 lockfile update를 수행한다. 보안 remediation처럼 목표 package가 명확하면 그 package와 필수 graph movement 외의 metadata 변경을 정상화라는 이유만으로 자동 승인하지 않는다.
4. `git diff -- package-lock.json`에서 목표 package 밖의 `version`, `resolved`, `integrity`, `license`, `bin`, dependency edge 또는 기타 metadata가 바뀌면 각각 upstream registry/package source 또는 package-manager semantics에 근거한 source-level justification이 있어야 한다. 근거가 없으면 regeneration을 폐기하고 원인을 조사한다.
5. 최종 exact head에서 `npm ci`, `npm audit --audit-level=high`, repository CI, Security Scan, reviewer-ci, packaging/provenance/release acceptance를 다시 실행한다. 이전 head의 성공은 재사용하지 않는다.

PR #76에서 npm 11.16.0 regeneration이 의도한 `nanoid` 변경 외에 `@esbuild/*`, `@img/sharp-win32-x64`, Wrangler metadata를 다시 기록한 사례가 이 계약의 직접 동기다. Green install/audit만으로 lockfile diff의 최소성이나 provenance가 입증되지는 않는다.

## Lockfile 변경 증거 계약

CI의 lockfile change-control은 경로 이름만 허용하는 allowlist가 아니다. 변경이 존재하면 `.github/lockfile-change-policy.json`의 **schema version 2**가 현재 pull request의 exact base SHA, 변경된 `packages` key의 정확한 집합, 그리고 각 key의 변경 전·후 package object를 canonical JSON으로 직렬화한 SHA-256을 모두 결합해야 한다. Object key 순서는 digest 의미에 영향을 주지 않지만 array 순서와 실제 값은 보존한다. package 생성·삭제는 `undefined`를 JSON `null`과 구분하는 presence envelope로 해시하여 graph movement 자체도 명시적으로 검토한다.

Schema version 2는 **closed field set**이다. 최상위 정책에는 `schemaVersion`, `baseSha`, `targetPackages`, `packageDigests`, `justification`, `sources`만 허용하며 다른 필드는 모두 실패-폐쇄한다. 이는 `approvedBy`, `expiresAt`, `ticket`, `waiver` 같은 그럴듯하지만 실제 validator가 집행하지 않는 필드가 정책에 섞여 사람 검토자에게 허위 보증을 주는 것을 막는다. 새로운 의미가 필요하면 기존 schema에 조용히 필드를 추가하지 않고 schema version과 검증·테스트·doctoring을 함께 변경해야 한다.

`package-lock.json`, exact-base lock snapshot, lockfile policy는 모두 **decoded object key가 유일한 JSON**이어야 한다. JSON parser가 마지막 값을 선택하는 중복-key 입력은 사람에게 보이는 text와 실제 검증 값 사이에 ambiguity를 만들 수 있으므로 실패-폐쇄한다. `baseSha`와 `base\u0053ha`처럼 escape decoding 후 같은 key가 되는 표현도 동일한 중복으로 취급하며, malformed·oversized·invalid UTF-8 입력과 같은 신뢰 경계에서 거부한다.

이 digest는 승인 권한이나 취약점 예외가 아니다. `version`만 기대한 보안 업데이트에서 `resolved`, `integrity`, `license`, `bin`, dependency edge 또는 다른 package metadata가 바뀌면 같은 package path 안의 변화라도 digest가 달라져 기존 정책은 실패한다. 따라서 검토자가 확인하지 않은 registry URL·SRI·metadata가 목표 package 경로에 섞이는 path-only approval 문제를 차단한다. 정책은 exact base SHA가 달라지거나 package object가 한 byte의 의미 차이라도 달라지면 새 증거로 재생성·재검토해야 하며, source URL과 justification 역시 별도 bounded provenance evidence로 유지한다.

정책은 CI가 이미 체크아웃한 exact head를 검증하는 retained evidence일 뿐 GitHub review, required check, branch protection, provenance, release acceptance 또는 deployment authority를 대체하지 않는다. stale-head 정책, 이전 base SHA 정책, 미등록 package 변화, malformed digest, top-level lock metadata 변화는 모두 실패-폐쇄한다.

## 불변 조건

- CI 또는 GitHub Actions가 lockfile이나 PR branch를 스스로 고치지 않는다.
- `.github/workflows/repair-*`, self-modifying workflow, `contents: write` repair path를 만들지 않는다.
- `npm ci`의 frozen-install semantics와 `npm audit --audit-level=high`를 완화하지 않는다.
- Node/npm identity mismatch는 install 전에 실패한다.
- dependency install scripts는 `strict-allow-scripts=true` 아래 exact reviewed identities만 `true`로 실행할 수 있고, 명시적 `false`는 executable authority를 부여하지 않는다.
- inert optional dependency를 통과시키기 위해 install-script 실행 권한을 확대하지 않는다.
- CI가 사용하는 JavaScript action은 검토된 Node 24-native release의 immutable full commit SHA로 고정하며 Node 20 compatibility fallback에 의존하지 않는다.
- package-manager 변경은 별도 reviewed change로 취급하며, lockfile regeneration과 exact-head evidence를 다시 만든다.
- dependency-security remediation에서 무관한 lock metadata churn은 명시적 source-level justification 없이는 수용하지 않는다.
- lockfile change policy는 exact base와 exact before/after package metadata를 결합하며, 경로 allowlist만으로 변경을 승인하지 않는다.
- schema version 2 policy는 closed field set이며 validator가 집행하지 않는 임의 의미 필드를 허용하지 않는다.
- lockfile·base snapshot·policy JSON은 escape decoding 이후에도 object key가 유일해야 하며 duplicate-key ambiguity는 실패-폐쇄한다.

## 근거

npm은 `package-lock.json`을 정확한 dependency tree를 기록해 팀·배포·CI가 같은 tree를 설치하도록 하는 파일로 정의하고, `npm ci`가 package manifest와 lockfile이 불일치하면 수정하지 않고 실패하며 lockfile에 쓰지 않는 frozen install 경로임을 명시한다. 또한 `devEngines`가 source tree에서 작업하는 개발자의 runtime/package manager를 통제하고 `install`, `ci`, `run` 전에 평가된다고 문서화한다. Node.js `v24.19.0` immutable tag의 vendored npm package metadata는 bundled npm 11.17.0을 직접 제공하며 CI의 실제 setup-node distribution과 일치한다.

npm 11.17.0 source는 explicit deny가 rebuild 실행을 차단하는 경계를 직접 보여주고, npm 11.18.0 changelog/source는 inert optional dependency를 strict preflight에서 제외하는 후속 수정 경계를 제공한다. 현재 선택은 더 새로운 npm을 별도로 bootstrap하는 것보다 하나의 immutable Node distribution을 유지하고, false-positive package에 실행 권한을 주지 않는 explicit deny를 쓰는 것이다.

GitHub의 공식 checkout release notes는 v5에서 action runtime을 Node 24로 전환했음을, setup-node v5 release notes도 Node 24 action runtime 전환을 명시한다. 현재 고정한 checkout 6.0.2와 setup-node 6.4.0은 각각 해당 Node 24-native release line의 검토된 immutable commit이다. action tag 자체는 mutable reference가 될 수 있으므로 workflow에는 release tag 대신 full commit SHA를 기록하고 주석으로 검토된 release version을 남긴다.

Lockfile policy의 SHA-256은 변경 증거를 exact package metadata에 결합하기 위한 repository-owned control이다. SHA-256 자체의 보안 속성은 NIST FIPS 180-4의 Secure Hash Standard에 근거하며, 이 digest는 package provenance를 독립적으로 증명하는 것이 아니라 검토된 exact before/after 값과 CI 입력의 불일치를 탐지하는 결합 값으로만 사용한다.

## 참고문헌

Cloudflare. (2026, June 25). *workerd release source: npm install wrapper (`npm/lib/node-install.ts`)*. https://github.com/cloudflare/workerd/blob/d3c2d082e29ae710ec94cd87faf0e6d738485275/npm/lib/node-install.ts

GitHub. (2026, January 9). *Checkout v6.0.2*. https://github.com/actions/checkout/releases/tag/v6.0.2

GitHub. (2026, April 20). *Setup Node v6.4.0*. https://github.com/actions/setup-node/releases/tag/v6.4.0

National Institute of Standards and Technology. (2015). *Secure Hash Standard (SHS) (FIPS PUB 180-4)*. U.S. Department of Commerce. https://doi.org/10.6028/NIST.FIPS.180-4

Node.js. (2026, August 3). *Node.js 24.19.0 “Krypton” (LTS), npm package metadata*. OpenJS Foundation. https://github.com/nodejs/node/blob/v24.19.0/deps/npm/package.json

npm, Inc. (2026). *npm 11.17.0 script policy matcher and rebuild enforcement*. https://github.com/npm/cli/blob/v11.17.0/workspaces/arborist/lib/arborist/rebuild.js

npm, Inc. (2026, June 29). *npm 11.18.0 changelog*. https://github.com/npm/cli/blob/v11.18.0/CHANGELOG.md

npm, Inc. (2026). *npm 11.18.0 unreviewed-scripts implementation*. https://github.com/npm/cli/blob/v11.18.0/workspaces/arborist/lib/unreviewed-scripts.js

npm, Inc. (2026). *npm ci*. npm Docs. Retrieved August 8, 2026, from https://docs.npmjs.com/cli/v11/commands/npm-ci/

npm, Inc. (2026). *package-lock.json*. npm Docs. Retrieved August 8, 2026, from https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json/

npm, Inc. (2026). *package.json*. npm Docs. Retrieved August 8, 2026, from https://docs.npmjs.com/cli/configuring-npm/package-json/
