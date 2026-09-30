# Patch-validator Node 24.21.0 / bundled Undici 7.29.1 수리

## 상태와 범위

**Status: Proposed owner repair.** 이 문서는 Noema issue #734의 canonical runtime 수리를 기록한다. Local RED→GREEN과 source identity 검증은 완료했지만, exact PR-head image build·smoke·SBOM·provenance·vulnerability receipt, fresh review, ordinary merge와 immutable release가 끝나기 전에는 protected 또는 released completion이 아니다.

## 문제와 사용자·운영 장면

Dependent Draft PR #733의 exact head `cab54e5d6c27768f67361b824feebfb210493397`에서 patch-validator run `36681968884`는 build, smoke와 SBOM 생성까지 완료한 뒤 vulnerability receipt verification에서 실패했다. Artifact `11088167853`(SHA-256 `72b8806b65cdd7607ebcd4eff6b33f58784ab2150761c209d93ab13c73b0c3f0`)은 protected runtime Node 24.19.0이 bundled Undici 7.29.0을 포함하고 GHSA-3wwx-pv8p-q78v에 해당함을 보였다. 따라서 동일 head rerun, scanner ignore, severity downgrade 또는 consumer workaround는 결과를 바꾸는 수리가 아니다.

구매자·운영자에게 필요한 실패 장면은 명확하다. Patch-validator가 untrusted pull-request patch를 검증하더라도 자체 static runtime에 알려진 취약점이 남아 있으면 그 검증 결과를 release evidence로 승격할 수 없다. 반대로 top-level Node CPE가 clean하다는 이유만으로 embedded Undici scan을 생략하면 false negative가 된다.

## Root cause

Noema의 Dockerfile, hosted workflow, package-manager identity, package note/CPE, exact `process.versions` inventory, applicability gate, tests와 문서가 Node 24.19.0/npm 11.17.0을 하나의 reviewed identity로 고정했다. 그 Node release는 Undici 7.29.0을 bundle한다. Inventory catalog는 Undici를 별도 PURL로 스캔했지만 fixed minimum을 코드로 강제하지 않아, 취약 runtime을 선택한 순간 raw scanner receipt가 올바르게 owner defect를 차단했다.

## 선택과 기각된 대안

선택한 수리는 official Node.js v24.21.0 source를 exact SHA-256으로 인증해 기존 fully-static `scratch` image를 다시 빌드하는 것이다. Signed tag `v24.21.0`은 verified annotated tag object `f37d7da830134b5314a14ced553273786a2bb4cd`에서 commit `955266bfdd854cd280dffd47548673914484e4c0`을 가리킨다. Official source tarball SHA-256은 `a6f54defb6fd7c84f41dba13d61e78e9b4e0961712cf61f29715c05f5ced94fc`이고, exact source는 npm 11.19.0과 Undici 7.29.1을 선언한다.

다음 대안은 기각했다.

- scanner ignore/VEX/severity 완화: 실제 bundled component를 제거하지 않는다.
- npm application override만 변경: `process.versions.undici`의 Node-bundled source를 바꾸지 않는다.
- mutable branch/head archive: TOCTOU와 source-identity 혼동을 만든다.
- c-ares/OpenSSL overlay 제거: 독립적으로 검토된 기존 보안 수리를 되돌린다.
- dependent #733에서 image를 우회: canonical Noema owner defect를 consumer에 복제한다.

## Executable RED→GREEN

RED는 `generateEmbeddedRuntimeInventory({ node: "24.21.0", undici: "7.29.0" }, exactDigest)`가 fixed Undici floor를 거부해야 한다는 회귀다. Production guard 전에는 Node mismatch만 검사하거나 vulnerable Undici를 inventory/scan plan에 허용해 이 oracle이 실패했다. GREEN은 다음 exact gates로 구성한다.

1. inventory가 Node `24.21.0`과 Undici `7.29.1`을 각각 exact-match한다;
2. Undici는 `pkg:npm/undici@7.29.1` scan plan에 남아 raw per-component Grype receipt를 계속 요구한다;
3. Docker build는 strip/package-note 전후 모두 실제 executable의 `process.versions.undici`를 검사한다;
4. Node source SHA, package note/CPE, npm identity, workflow toolchain과 static-runtime applicability versions를 같은 delta에서 갱신한다;
5. full scanner receipt와 blocking severity policy를 그대로 보존한다.

Local focused verification은 exact Node 24.21.0/npm 11.19.0에서 48 files / 339 tests GREEN이었다. Full typecheck도 GREEN이고, full suite는 763 files / 5,162 tests 가운데 762 files / 5,161 tests가 통과했다. 남은 한 fixture는 executor가 Unix-domain socket 생성을 `listen EPERM`으로 거부해 Noema code에 도달하기 전에 실패했다. 그 unsupported fixture만 제외하면 762 files / 5,161 tests가 모두 통과하지만, 해당 fixture가 unrelated dependency-license special-output branch 한 줄의 유일한 coverage source이므로 aggregate coverage는 99.98%다. Hosted exact-head CI가 socket fixture와 100% configured coverage를 다시 검증해야 한다. 이 결과는 local source evidence일 뿐 exact PR-head image receipt 또는 merge authority가 아니다.

## Exact embedded-runtime revalidation

Exact Node 24.21.0 executable은 `process.versions`에서 다음 transition을 보고한다: nghttp2 `1.70.0`, SQLite `3.53.4`, V8 `13.6.233.17-node.53`, zlib `1.3.2.1-motley-8002e91`, Undici `7.29.1`, npm `11.19.0`. Existing c-ares `1.34.8`와 OpenSSL `3.5.8` overlay는 유지된다.

V8 applicability는 새 signed tag source에 다시 결합했다. Exact `deps/v8/src/compiler/js-call-reducer.cc` blob `0577f9cafeeee721c157288c88b9404abe60364a`에는 `ReduceArraySort`가 없고, exact `deps/v8/src/maglev/maglev-graph-builder.cc` blob `db081bfde623c3fd491d4d773a560ac446b32660`에는 `TryReduceArrayPrototypeSort`가 없다. 따라서 기존 CVE-2026-85046 decision은 새 exact Node/V8/CPE/scanner tuple에서만 유지하며 어떤 mismatch도 fail closed한다. Exact PR-head raw scanner result가 새로운 finding을 보고하면 이 source inspection이 그것을 자동 면제하지 않는다.

## 남은 완료 증거

- full typecheck/test/100% configured coverage/security audit;
- exact PR-head patch-validator image build, no-network/read-only/non-root smoke;
- exact image ID에 결합된 CycloneDX, Syft, Node CPE, embedded inventory, Grype/Trivy, provenance receipt;
- GHSA-3wwx-pv8p-q78v가 absent임을 보이는 raw scanner evidence;
- fresh exact-head review, applicable required checks와 qualifying independent approval;
- ordinary merge, immutable Noema release/evidence, 이후 dependent #733 refresh.

## 참고문헌 — APA 7

GitHub Advisory Database. (2026). *GHSA-3wwx-pv8p-q78v*. GitHub. https://github.com/advisories/GHSA-3wwx-pv8p-q78v

Node.js. (2026, September 8). *Node.js v24.21.0 (LTS)*. https://nodejs.org/en/blog/release/v24.21.0

Node.js. (2026, September 8). *Node.js v24.21.0 release archive*. https://nodejs.org/en/download/archive/v24.21.0

Node.js. (2026, September 8). *Node.js v24.21.0 source* (signed tag; commit `955266bfdd854cd280dffd47548673914484e4c0`). GitHub. https://github.com/nodejs/node/releases/tag/v24.21.0

OWASP Foundation. (2025). *Software component verification standard*. https://scvs.owasp.org/
