# Noema Product and Technical Gap Baseline

## Authority and update rule

이 문서는 protected source, active candidate, transient workflow evidence와 foreign-owner authority를 분리한다. Open PR exact head, protected base, required workflow, review thread, release와 central dependency는 mutation·merge·release 직전에 다시 읽는다. predecessor GREEN, queued/pending/in-progress/skipped/cancelled run, 오래된 PR base snapshot과 scanner/model judgement는 다음 revision의 merge authority로 전용하지 않는다.

Current protected source는 GitHub-verified protected `main@0dbfceb850cda3a016ceb39ae1c8a1a96a9f2ad5`다. 이 protected revision에는 normal #535 merge가 포함돼 있고, merged PR #535 exact `82b20b293f0a5f0ac0e69857c1b61dddfe478491`의 strict `orchestrator/free` consumer, provider-endpoint fail-closed contract와 reviewer `timeout=None`/`max_retries=0` semantics가 protected source가 됐다. Current source SHA는 moving observation이며 future merge 뒤 evergreen identity로 취급하지 않는다.

이 revision 작성 시 moving central control-plane snapshot은 central `.github/main@7fd571dbcdbae6acf29d8f4ee704d7ba6297e4db`다. Noema runtime의 reviewed immutable central consumer pin은 `c9052e607e5f3cc76e73207e7786b21500721b79`이고 runtime authority 표현은 `ALLOWED_WORKFLOW_SHA = c9052e607e5f3cc76e73207e7786b21500721b79`다. Moving foreign head와 reviewed immutable pin을 같은 권위로 취급하지 않으며, central moving head가 전진했다고 Noema consumer pin을 자동 승격하지 않는다.

Merged documentation history에는 merged PR #547 exact `30b7e7e5cdab8de65715834a16f994b2047eafa6`가 있고, toolchain history에는 merged PR #540 exact `05bc2d47c3899ebe17538070f9a30172f90307ac`, durable workflow/state history에는 merged PR #542 exact `ca839298fcaeec409091dc909789b6f87eb67fdc`, work-conserving concurrency에는 merged PR #550 exact `f2ec2dc6709814070cc3e3d6932ce280aee966db`, automation threat-model documentation에는 merged PR #553 exact `3bd9f543e97ce856f78b1c608141436298ce9e74`, patch-validator default-branch cache-seed history에는 merged PR #558 exact `2f91bf8641212ecae435b5fbcc9084cc0acd6295`가 포함돼 있다. 이 SHA들은 protected lineage의 역사 증거이며 open-candidate authority가 아니다.

#559가 cross-lane commercial baseline과 executable documentation-authority tests를 소유한다. 다른 feature lane에 포함된 과거 baseline blob은 ordinary/non-force semantic convergence 때 current authority로 승계하지 않는다.

## Canonical product boundary

Noema Core Domain은 **Agent Runtime**과 **Workflow / Task Execution**이다. **Tool / Capability Boundary**, **State / Checkpoint**, **Isolation Integration**, **Policy / Approval**, **Observability**, **Recovery**는 명시적 bounded context다. Execution identity, side-effect authority, claim/checkpoint CAS, cancellation/recovery invariant는 Noema transaction boundary에 남긴다.

`contextual-orchestrator`는 provider/model discovery, routing, retry/failover, test-time compute와 provider credential을 소유한다. Noema는 released gateway contract와 canonical `orchestrator/free` alias를 소비할 뿐 direct provider SDK, provider key, provider/model/group fallback policy를 소유하지 않는다. `.github`는 organization reusable workflow와 control-plane source를 소유한다. `quarantine-sandbox-runtime`, Wardnet, EgressWeave, AppGuardrail은 isolation/security/outbound truth를 각자 소유한다. Keyverse는 identity backend owner다. `context-graph-contracts`와 `enterprise-architecture-core`는 released/versioned contract로만 연결하고 mutable sibling PR source, copied domain table, cross-service SQL을 runtime truth로 사용하지 않는다.

#550은 PR-scoped supersession cancellation과 work-conserving dispatch를 protected source에 통합했다. #542는 Durable Workflow / Task Execution과 State / Checkpoint의 atomic task claim, checkpoint CAS/replay, effect-start/terminal authority, cancellation/recovery 및 retained-provenance validation을 protected source로 만들었다. ADR 0013은 deployed Durable Object transaction/runtime evidence가 없으므로 `Proposed`를 유지한다. #540은 historical Wrangler/Miniflare/Sharp/Libvips tooling path를 제거하고 pinned `workerd@1.20260625.1` + `esbuild@0.28.1`, canonical lock/license evidence와 patch-validator dependency pruning을 protected source에 통합했다. #535는 repository-selected provider/model authority를 제거하고 canonical `orchestrator/free` alias와 contextual-orchestrator gateway boundary를 protected source에 통합했다.

## Active candidate convergence — 2026-09-08 KST

### Exact-claim evidence receipts — issue #555 / PR #556

Observed PR #556 exact `860714cba46dba06260a5dce09d0e9152fcb0a8c`는 Draft이고 default `main`을 base로 한다. Prerequisite #535는 이미 normal merge돼 protected `main@0dbfceb850cda3a016ceb39ae1c8a1a96a9f2ad5`가 되었으며, #556은 그 protected source 위의 ahead-only candidate다. `live #556 must be re-fetched before integration`이며 predecessor head의 gate나 review evidence는 전용하지 않는다.

#556의 retained contract는 authenticated producer receipt와 `ClaimEvidenceRequirement` publication authority를 분리한다. Raw current-head source receipt는 context authority일 뿐이고, trusted producer가 exact claim/evidence kind와 finding coordinates를 명시적으로 승인하지 않는 한 blocking finding을 권위화하지 못한다. Requirement/receipt mismatch, wrong coordinates, direct model dictionaries, context-to-finding promotion은 deterministic gate와 publisher 전에 fail closed한다.

Test-only `dbab4cdc150d4973002f8b61173282f7c7542725`는 claim이 exact source line에서 파생돼야 한다는 regression contract를 추가했다. Hosted workflow generation은 후속 mutation의 정상 `cancel-in-progress`로 test execution 전에 cancelled돼 hosted RED로 주장하지 않는다. Production `440346ee73e60e87915bd3027a774e24d3ac5124`는 exactly-one-line UTF-8 decoding과 claim equality를 fail closed로 강제했다. Edge head `920eb7be0c3f57c5f149328a08beddc13339a338`은 LF/CRLF/unterminated line, paraphrase mismatch, embedded multi-line bytes와 invalid UTF-8 edge를 고정했다.

Exact `920eb7be...`는 실제 hosted reviewer-ci RED를 만들었다. Run `34190991526`, job `101948849348`에서 exact checkout, noema-core 100% line+branch coverage와 100% docstring gate는 통과했지만 reviewer suite가 **1 failed / 721 passed**로 종료됐다. 실패는 stale `_source_bundle()` fixture가 exact source bytes와 runtime paraphrase를 계속 결합하던 데 있었고, causal test repair `1cd8db5a94ed420bed8b52be0d3b3354f9fc86ab`은 source claim을 exact decoded line으로 맞추면서 source-vs-execution kind mismatch rejection을 보존했다. 후속 `809ccb78bfdf8f9785d4c74ab834159961cce6e9`은 review에서 확인된 unused import만 제거했다.

그 뒤 publisher boundary review는 finding-free `request_changes`/`blocked` model verdict가 receipt admission을 건너뛴 채 GitHub non-approval로 게시될 수 있는 vacuous-oracle bypass를 찾았다. RED `6629f07e2c7bd35698331d8966b7cbe35204a808`은 실제 PydanticAI agent→CLI publisher seam에서 두 non-approval 상태를 재현하고, GREEN `4c2153702972e8d5c0f077ac79cc68cbf6da4bfb`은 model non-approval에 producer-authenticated finding을 필수화했다. Current exact `860714cba46dba06260a5dce09d0e9152fcb0a8c`은 CHANGELOG authority까지 포함한다.

Current #556 exact generation은 application CI `34197596549`, reviewer-ci `34197596588`, required Security Scan `34197596536`, patch-validator-image `34197596517`이다. 이 revision 작성 시 application CI, reviewer-ci, required Security는 terminal SUCCESS이고 patch-validator-image만 `in_progress`다. 따라서 3-GREEN이지 four-GREEN이 아니며 image lane이 terminal success가 되기 전 normal merge authority는 없다. Default `main` retarget 뒤 required Security Scan이 materialize되므로 absent/queued/skipped/cancelled/failed Security를 passing으로 취급하지 않는다.

Remaining supply-chain boundary는 exact stdout/stderr producer, trusted research producer, immutable Noema release, released central `.github#1641` consumer bump와 unchanged original/synonym corpus RED→GREEN이다.

### External extension admission — issue #545 / PR #560

Observed PR #560 exact `81bff2f61ab6c323845116acd9622334f9dcfadd`는 Draft이고 default `main`을 base로 한다. 이 lane은 Tool / Capability Boundary만 소유하며 plugin source, provider routing, quarantine/security/outbound implementation을 Noema로 복제하지 않는다. ADR 0015는 `Proposed`이고 local ACL/test double은 `context-graph-contracts`의 immutable shared artifact contract가 나오기 전의 fail-closed boundary다.

Initial exact `e23d9ef941f453720ddc1456c7bc208e9434a7b2`의 hosted application CI run `34195202961`, job `101961294823`은 exact checkout, live-base, lockfile, install, typecheck를 통과한 뒤 repository-wide public API documentation gate에서 실패했다. 새 external-extension module의 12 public exported type/interface가 meaningful adjacent JSDoc을 충족하지 못한 현실 RED였다. Production behavior나 gate를 약화하지 않고 `469efe70b673a2c58d93e1944721216e167afc9b`에서 해당 public contracts에 의미 있는 JSDoc을 추가했다.

Invocation-time source-integrity review에서는 admission이 pin한 catalog identity 여섯 필드 중 일부만 재검증돼 “catalog drift cannot silently update an admitted extension” invariant가 불완전한 것을 찾았다. Test-only exact `58f8bbadd6a4a3863d642883e40f4753f6dc291f`의 application CI `34197933796`, job `101969766167`은 exact checkout, live-base, lockfile, install, typecheck 뒤 release tests에서 **4 / 4167 failed**의 실제 hosted RED를 만들었다. `6b7b5d64d28a46464c854c74ac33ac1b01a888f2`는 drift fixture만 바로잡았고, production `572aa5919210b511e58d70e809dbefc60196ada7`는 activation scope/time을 재검증하면서 live catalog를 extension id/repository/commit/path/artifact/marketplace digest 전체 six-field identity에 묶었다.

그 뒤 public invocation이 structurally constructible activation을 authority로 믿는 결함을 test-only `2987e8625fb0964eb119a4be337280b49588e8bc`가 재현했고 application CI `34199961782`에서 실제 hosted RED가 관찰됐다. 또 exported `AdmittedExternalExtension` fabrication이 AppGuardrail/quarantine receipt admission을 건너뛸 수 있어 test-only `632c77b9db9f39662f78087b3b4eca45b46cf9d9`가 activation boundary를 고정했다. Ordinary descendant `f9be6fbecd566d197caa7317bc99de4b931573d1`은 admitted-extension provenance를 module-private runtime authority로 결합했다.

Fresh review는 field-identical activation clone과 invocation-receipt replay clone, invocation 시점의 AppGuardrail/quarantine receipt revocation TOCTOU를 추가로 찾았다. Test-only `3b072f8f9c07959187006fa926812bbc713aff99`은 activation clone을, test-only parent `0323a3c67767b5e137de6b754a8173c51d709c21`은 owner receipt revocation과 retained replay clone을 고정했다. Current production `81bff2f61ab6c323845116acd9622334f9dcfadd`는 admitted extension, activation, invocation receipt의 issuance provenance를 module-private runtime authority로 인증하고, invocation 때 AppGuardrail/quarantine receipts를 다시 resolve해 artifact/isolation-policy/producer-owner binding을 재검증한다. Scope/time 및 six-field catalog identity fail-closed 검증은 유지한다.

Current #560 exact generation은 application CI `34204455463`, reviewer-ci `34204455676`, required Security Scan `34204455766`, patch-validator-image `34204455409`다. 이 revision 작성 시 네 lane 모두 queued이며 predecessor local 34-pass/owned production 100%/typecheck evidence를 hosted GREEN으로 승격하지 않는다. 두 substantive review thread는 production repair를 기록했지만 exact-head hosted verification 전까지 intentionally unresolved 상태라 merge authority가 아니다.

Shared completion boundary는 immutable `context-graph-contracts` external-capability contract, live AppGuardrail/quarantine owner evidence, bounded pilot evidence, exact-head four-GREEN, clean review authority와 normal merge다. Noema가 mutable sibling ref나 foreign scanner/isolation/egress implementation을 복제해 completion을 제조하지 않는다.

### Cross-lane documentation authority — PR #559

#559는 이 baseline과 다섯 executable documentation-authority tests의 sole writer다. Exact predecessor `44d2050804ef1d167b2170dcf6fc31657900b9f6`의 application CI `34193418411`은 release tests에서 1건 실패했다. Baseline은 문장 시작의 `Run `34190991526``을 올바르게 기록했지만 executable test가 lowercase `run` exact substring을 요구한 docs/test casing mismatch였다. Gate를 느슨하게 하거나 baseline을 부자연스럽게 바꾸지 않고 `9c14c4e2e5d7fb0d51e0510ea3489d42ba4df0e8`에서 test oracle을 실제 문장 casing에 맞췄다.

#560이 `81bff2f...` production repair까지 전진하면서 #559 exact `16e006c605b5ff28858a9ab4c29154e8b800c8e2`의 baseline/oracle은 stale authority가 됐다. Test-only `e86592848162e68e7001e8acb54bd2973ac6bb40`은 current #560 exact와 current run generation을 먼저 요구한다. 후속 production documentation repair는 이 baseline만 code-current하게 맞추며 feature-lane source나 predecessor gate를 전용하지 않는다. Test-only predecessor가 branch advancement 때문에 실행 전에 취소되거나 queued로 남으면 hosted RED로 주장하지 않는다.

## Protected but incomplete commercial evidence

### Orchestrator/free consumer — merged #535

Merged PR #535 exact `82b20b293f0a5f0ac0e69857c1b61dddfe478491`는 protected `main@0dbfceb850cda3a016ceb39ae1c8a1a96a9f2ad5`에 normal integration됐다. Provider/model routing은 `contextual-orchestrator` owner에 남고 Noema는 `orchestrator/free`와 gateway-only credentials를 소비한다. Source integration 자체는 immutable Noema package/release, SBOM/provenance/reproducibility 또는 downstream consumer activation을 증명하지 않는다.

### Patch-validator default-branch cache seed — merged #558 / issue #66

Merged PR #558 exact `2f91bf8641212ecae435b5fbcc9084cc0acd6295`는 protected source에 포함됐다. Protected-main prior push `patch-validator-image` run `34179912851`은 terminal SUCCESS다. 그 성공만으로 cache hit 성능, immutable image digest publication, signature/attestation, reproducibility 또는 rollback을 증명하지 않는다.

### Toolchain and inbound rights — issue #531 / merged #540

Source remediation은 protected lineage에 있다. 남은 권위는 exact released package/image/SBOM/provenance/reproducibility, NOTICE/attribution, actual artifact rights와 explicit owner/legal outbound-rights evidence다. Source-only license inventory를 release evidence로 승격하지 않는다.

### Durable runtime operation — issue #541 / merged #542

Durable workflow/state source는 protected lineage에 있다. 남은 권위는 deployed Durable Object binding/transaction compatibility, recovery/rollback receipt, immutable release/package/SBOM/provenance/reproducibility다. 이 evidence 전까지 ADR 0013은 `Proposed`다.

## Current authority table

| Lane | Authority | Integration / completion condition |
| --- | --- | --- |
| Protected source | live protected main; current observation protected `main@0dbfceb850cda3a016ceb39ae1c8a1a96a9f2ad5` | mutation·merge·release 직전 exact protected head 재조회 |
| Central workflow trust | central `.github/main@7fd571dbcdbae6acf29d8f4ee704d7ba6297e4db`; reviewed pin `c9052e607e5f3cc76e73207e7786b21500721b79` | moving head와 immutable reviewed pin 분리; released/reviewed consumer bump 전 자동 승격 금지 |
| Toolchain/license source | merged PR #540 exact `05bc2d47c3899ebe17538070f9a30172f90307ac` | source complete; release/publication/rights evidence 미완료 |
| Durable workflow/state source | merged PR #542 exact `ca839298fcaeec409091dc909789b6f87eb67fdc` | source complete; deployed runtime/recovery/release evidence 미완료 |
| Documentation authority | merged PR #547 exact `30b7e7e5cdab8de65715834a16f994b2047eafa6` + active #559 successor | moving PR/protected/central truth를 #559에서 code-current 유지 |
| Orchestrator/free consumer | merged PR #535 exact `82b20b293f0a5f0ac0e69857c1b61dddfe478491` | protected source complete; immutable Noema release와 released consumer evidence 미완료 |
| Patch-validator cache seed | merged PR #558 exact `2f91bf8641212ecae435b5fbcc9084cc0acd6295`; protected run `34179912851` SUCCESS | protected operational execution complete; immutable image/release evidence 미완료 |
| Exact-claim receipts | observed PR #556 exact `860714cba46dba06260a5dce09d0e9152fcb0a8c` | fresh Security-inclusive exact-head gates, clean review, normal merge, execution/research producer evidence, immutable release |
| External extension admission | observed PR #560 exact `81bff2f61ab6c323845116acd9622334f9dcfadd` | fresh exact-head gates, resolved valid review findings, normal merge; immutable shared owner contract and live owner receipts remain external prerequisites |

## Evidence semantics and merge rules

A PR can be review-clean while non-authorizing. Review thread resolution, CI, reviewer-ci, required Security Scan, image/SBOM/provenance and branch ancestry are separate evidence classes. Every source mutation or restack invalidates predecessor workflow evidence. `queued`, `pending`, `in_progress`, `skipped`, `cancelled`, stale or absent-required evidence is not passing.

Normal merge requires unchanged exact head, independently refreshed live base/head, no valid unresolved review finding, applicable required terminal-success gates and no foreign-owner/protected-contract regression. Concurrent commits or pushes are not called a race merely because they occur. Wrong base/conflict, stale ADR identity, mutable dependency, missing fixture/contract or single-writer violation is repaired by ordinary/non-force semantic convergence rather than force push, destructive rebase or casual Close.

PR 0은 useful work를 닫아 제조하지 않는다. Open lane은 normal merge 또는 verified successor가 모든 유효 delta/test/fixture/contract/evidence를 완전히 승계한 경우에만 사라진다. Blocked lane은 자기 lane만 막고 unrelated safe review, owner-path repair, docs-to-code repair와 buyer-gap work는 계속한다.

## Commercial gap register

| Priority | Gap | Buyer/operator impact | Current owner | Authoritative completion evidence | Next executable action |
| --- | --- | --- | --- | --- | --- |
| P0 | Exact-claim evidence supply chain | Tool/research claim이 producer evidence 없이 reviewer authority로 승격되면 blocking review가 잘못 권위화될 수 있다. | issue #555 / PR #556 | source-claim binding + non-vacuous producer findings + execution/research producer evidence + fresh gates + normal merge + immutable release + released consumer RED→GREEN | exact `860714c...` image/review 확인; four-GREEN이면 protected ancestry 재조회 후 normal merge |
| P0 | External extension capability admission | third-party plugin metadata·prompt·hook를 runtime authority로 오인하면 제품 경계와 고객 데이터가 확장 코드에 노출될 수 있다. | issue #545 / PR #560 | immutable source identity + independent scan receipts + full live catalog/receipt revalidation + authenticated issuance provenance + no undeclared capability + fresh gates + clean review + normal merge + immutable shared-contract consumption | exact `81bff2f...` hosted gates 확인; failure면 causal repair, four-GREEN 뒤 valid open threads resolve 여부 재검증 |
| P0 | Strict orchestrator/free consumer release | Source는 protected됐지만 immutable released package와 central consumer activation이 없으면 commercial integration contract가 완결되지 않는다. | merged #535 + release lane | protected exact release/tag/package/SBOM/provenance/reproducibility + released consumer | release-ready protected head에서만 immutable publication evidence 생성 |
| P0 | Patch-validator operational publication | source merge만으로 reusable cache와 immutable runtime activation을 증명할 수 없다. | issue #66 | protected-main image/cache receipt + immutable image/signature/SBOM/provenance/reproducibility/rollback | successful protected run `34179912851`을 immutable publication evidence와 결합 |
| P0 | Toolchain/license release evidence | source dependency remediation만으로 실제 배포 artifact 권리와 재현성을 증명할 수 없다. | issue #531 | protected exact release package/image/SBOM/provenance/reproducibility/NOTICE/rights | release-ready protected exact head에서만 publication evidence 생성 |
| P0 | Reviewer/Maintainer production identity | source control만으로 App installation, key custody/rotation, bounded publication authority를 증명할 수 없다. | issues #29 / #227 | live installation/permissions/key-custody/rotation + bounded publication/recovery receipt | approved control-plane evidence와 source evidence를 분리 보존 |
| P0 | Governance enforceability | workflow source만으로 approval/deletion/rewrite/break-glass 정책 전체를 증명할 수 없다. | issue #27 | live ruleset/protection audit + observed required-workflow behavior | protected mutation 직전 governance 재조회 |
| P1 | Durable runtime operation | source-level durable semantics와 deployed transaction/recovery는 별도 evidence class다. | issue #541 | deployed compatibility + recovery/rollback + immutable release identity | evidence 전 ADR 0013 `Proposed` 유지 |
| P1 | Production KPI evidence | fixture는 reliability, latency, commercial operation을 입증하지 못한다. | issue #3 | authenticated retained production KPI window with source/run identity and denominator | approved production source가 없으면 fail closed 유지 |
| P1 | Acquisition transfer | Apache-2.0 source grant는 contributor ownership, assignment, artifact-transfer rights 자체를 증명하지 않는다. | issue #5 | exact-release rights metadata, dependency/NOTICE/SBOM, contributor/IP and transfer evidence | immutable release 이후 acquisition evidence 수집 |

## Completion discipline

각 gap은 Authoritative completion evidence가 실제로 존재하고 current source/head에 결합될 때만 닫는다. 문서 존재, synthetic fixture, model judgement, stale workflow result를 완료 증거로 사용하지 않는다. Release-ready exact protected head가 없으면 version/tag/package/SBOM/provenance/rollback을 제조하지 않는다.
