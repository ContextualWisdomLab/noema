# 패키지 관리자·lockfile 재현성 계약

## 결정

Noema의 검토·CI·lockfile 재생성 기준 개발 도구 체인은 **Node.js 24.19.0**과 **npm 11.17.0**으로 고정한다. `package.json`의 `packageManager`와 `devEngines`가 그 identity를 선언하고, CI는 설치 전에 실제 `node --version`과 `npm --version`을 exact-match로 다시 확인한다. 제품 자체의 지원 범위인 `engines.node >=22`와 개발·lockfile 생성 도구 체인은 별도 계약이다.

CI의 JavaScript Action도 mutable major tag를 실행 근거로 사용하지 않는다. `actions/checkout` 6.0.2와 `actions/setup-node` 6.4.0의 검토된 full commit SHA를 workflow에 고정한다. 두 action 계열은 Node 24 runtime을 사용하는 현재 release line이다. 이 Action source pin 결정의 범위는 `.github/workflows/ci.yml`이다.

## Install-script 실행 권한

프로젝트 `.npmrc`는 `strict-allow-scripts=true`를 요구한다. 현재 `package.json`에서 `esbuild@0.28.1`은 실행을 허용하고, `workerd@1.20260625.1`도 실행을 허용한다. `fsevents@2.3.3`은 명시적 `false`로 거부한다. `false`는 검토된 deny 결정이지 실행 권한이 아니다. 새 dependency lifecycle script가 policy에 없으면 `npm ci`가 성공해서는 안 된다.

이 경계는 vulnerability metadata와 별개다. `npm audit`이 clean이어도 install-time code가 검토됐다는 뜻이 아니며, 반대로 install-script policy는 알려진 vulnerability를 면제하지 않는다. `--dangerously-allow-all-scripts`, blanket script 허용, audit waiver, severity 완화는 이 계약의 remedy가 아니다.

실제 회귀 테스트는 local file dependency에 `postinstall` marker를 넣고, network 없이 lock을 만든 다음 strict policy 아래 `npm ci`가 non-zero로 끝나며 marker가 생성되지 않는지 확인한다. 따라서 단순 configuration-string 검사가 아니라 실행 경계 자체를 검증한다.

## Frozen install과 predecessor 보존

이 stack은 선행 보안 remediation이 고정한 `nanoid@3.3.17`을 그대로 보존한다. `npm ci --legacy-peer-deps=false --install-links=false`는 reviewed predecessor의 frozen-install 경계이며, 후속 재현성 작업이 이를 임의의 기본값으로 되돌리지 않는다.

npm 문서가 설명하듯 `npm ci`는 project manifest와 lockfile이 불일치하면 lockfile을 고쳐 주는 복구 경로가 아니라 실패하는 clean-install 경로다. 따라서 CI가 lockfile을 생성·수정하거나 PR branch를 자동 수선하지 않는다.

## Live base와 lockfile change control

Pull request event의 base snapshot을 현재 base branch tip으로 오인하지 않는다. CI는 lockfile change control 전에 live base ref를 독립 조회하여 event의 exact base SHA와 같음을 요구하고, release verification 뒤에도 같은 조회를 반복해 검증 도중 base가 이동하지 않았음을 확인한다.

변경이 없는 lockfile은 별도 승인 객체를 만들지 않는다. lockfile의 `packages` map 또는 top-level metadata가 바뀌면 `.github/lockfile-change-policy.json`의 **schemaVersion 3** closed contract가 필요하다. 이 contract는 다음을 모두 결합한다.

- exact base SHA;
- 변경된 `packages` key의 정확한 전체 집합;
- 각 key의 exact **before/after** package object에 대한 canonical SHA-256;
- `topLevelMetadataDigests`의 exact before/after canonical SHA-256;
- 128개 초과 package 변경 시 `bulkChange`의 exact package count와 전체 packages-map before/after digest;
- bounded justification;
- bounded HTTPS primary-source evidence.

`schemaVersion 3`에는 `schemaVersion`, `baseSha`, `targetPackages`, `packageDigests`, `topLevelMetadataDigests`, `bulkChange`, `justification`, `sources`만 허용한다. `bulkChange`는 128개 이하 package 변경에서는 반드시 `null`이어야 하고, 129~1,024개 변경에서는 exact `targetPackageCount`, `beforePackagesSha256`, `afterPackagesSha256`을 요구한다. 1,024개를 초과하는 package-key 변경은 policy가 있더라도 실패 폐쇄한다. validator가 집행하지 않는 `approvedBy`, `waiver`, `expiresAt` 같은 그럴듯한 필드를 추가해 사람에게 허위 보증을 주는 것을 금지한다. 새로운 의미가 필요하면 schema version·validator·tests·doctoring을 함께 변경한다.

Canonical hashing은 object key 순서를 정규화하지만 array 순서는 보존한다. package 생성/삭제는 값이 없는 상태와 JSON `null`을 구분한다. 같은 package path 안에서도 `version`, `resolved`, `integrity`, `license`, `bin`, dependency metadata가 달라지면 digest가 달라져 기존 policy는 실패한다. top-level `version`, `lockfileVersion`, `requires` 같은 metadata drift도 `topLevelMetadataDigests`가 exact before/after 상태를 결합하지 않으면 승인되지 않는다.

## JSON·filesystem 신뢰 경계

`package-lock.json`, base snapshot, change policy는 malformed·oversized·invalid UTF-8 입력을 거부한다. JSON object key는 escape decoding 뒤에도 유일해야 한다. 예를 들어 `baseSha`와 `base\u0053ha`가 같은 object에 동시에 존재하는 **duplicate** key ambiguity는 parser의 last-value 선택에 맡기지 않고 실패 폐쇄한다.

File evidence는 descriptor 기반 bounded read를 사용한다. regular file이 아니거나 symlink를 통하거나 byte ceiling을 넘거나, 읽는 동안 inode/device/mode/size/mtime/ctime identity가 바뀌면 거부한다. runtime에 no-follow semantics가 없다면 안전하다고 추정하지 않는다.

## 증거 권한 분리

Lockfile policy와 CI 결과는 supply-chain evidence일 뿐 **not merge authority**다. 다음은 서로 독립적인 evidence/authority class로 유지한다.

- exact source head와 independently resolved live base;
- package-manager/toolchain identity;
- install-script authorization;
- lockfile change authorization evidence;
- vulnerability audit/scanner evidence;
- check runs와 commit statuses;
- formal review와 model judgement;
- merge/protected-main acceptance;
- release·deployment·acquisition evidence.

Predecessor head의 green run, model comment, status-only signal, stale base, synthetic merge scan 또는 queued/pending check를 새 exact head의 성공으로 이전하지 않는다.

## 재생성·검증 절차

1. Node.js 24.19.0 / npm 11.17.0 exact identity를 확인한다.
2. 현재 protected/base lockfile을 immutable 비교 기준으로 보존한다.
3. 목표 dependency만 변경하고 unrelated metadata churn을 별도 근거 없이 수용하지 않는다.
4. lockfile diff가 존재하면 schemaVersion 3 policy를 exact base, exact package before/after digest, exact `topLevelMetadataDigests`, 그리고 필요 시 `bulkChange` evidence에 결합한다.
5. `npm ci --legacy-peer-deps=false --install-links=false`로 frozen install을 검증한다.
6. exact head에서 typecheck, complete tests, 100% configured production coverage, `npm audit --audit-level=high`, repository CI와 applicable reviewer/security/provenance gates를 다시 실행한다.
7. base가 verification 중 이동했으면 결과를 폐기하고 새 live base에서 다시 판단한다.

CI나 GitHub Actions가 lockfile이나 PR branch를 자체 수정하는 `.github/workflows/repair-*`, self-modifying workflow 또는 `contents:write` repair path는 사용하지 않는다.

## 참고문헌 — APA 7

GitHub, Inc. (2026). *actions/checkout releases*. GitHub. https://github.com/actions/checkout/releases

GitHub, Inc. (2026). *actions/setup-node releases*. GitHub. https://github.com/actions/setup-node/releases

npm, Inc. (2026). *npm ci*. npm Docs. https://docs.npmjs.com/cli/v11/commands/npm-ci/

npm, Inc. (2026). *package.json*. npm Docs. https://docs.npmjs.com/files/package.json

npm, Inc. (2026). *.npmrc*. npm Docs. https://docs.npmjs.com/cli/v11/configuring-npm/npmrc/

npm, Inc. (2026). *npm approve-scripts*. npm Docs. https://docs.npmjs.com/cli/v11/commands/npm-approve-scripts/

npm, Inc. (2026). *npm CLI v11 changelog*. npm Docs. https://docs.npmjs.com/cli/v11/using-npm/changelog/
