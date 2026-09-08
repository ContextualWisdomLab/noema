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

Observed PR #556 exact `809ccb78bfdf8f9785d4c74ab834159961cce6e9`는 Draft이고 default `main`을 base로 한다. Prerequisite #535는 이미 normal merge돼 protected `main@0dbfceb850cda3a016ceb39ae1c8a1a96a9f2ad5`가 되었으며, #556은 그 protected source 위로 ordinary/non-force restack/retarget됐다. `live #556 must be re-fetched before integration`이며 predecessor head의 gate나 review evidence는 전용하지 않는다.

#556의 retained contract는 authenticated producer receipt와 `ClaimEvidenceRequirement` publication authority를 분리한다. Raw current-head source receipt는 context authority일 뿐이고, trusted producer가 exact claim/evidence kind와 finding coordinates를 명시적으로 승인하지 않는 한 blocking finding을 권위화하지 못한다. Requirement/receipt mismatch, wrong coordinates, direct model dictionaries, context-to-finding promotion은 deterministic gate와 publisher 전에 fail closed한다.

Fresh source-authority review에서 exported `produce_source_claim_receipt()`가 `claim`과 `source_line_bytes`를 독립적으로 seal하고 서로 같은 의미인지 확인하지 않는 결함이 확인됐다. 기존 producer test는 실제 line `run: cargo generate-lockfile --locked\n`에 대해 paraphrase claim `the workflow invokes cargo generate-lockfile --locked`를 성공적으로 receipt화하고 있었다. 이 상태에서는 producer call이 path/line hash와 별개의 claim digest를 결합해 exact source finding처럼 보이는 권위를 만들 수 있었다.

Test-only `dbab4cdc150d4973002f8b61173282f7c7542725`는 claim이 exact source line에서 파생돼야 한다는 regression contract를 추가했다. Hosted workflow generation은 materialize됐지만 후속 branch mutation의 정상 `cancel-in-progress`에 의해 test execution 전에 cancelled됐으므로 hosted RED로 주장하지 않는다. Production `440346ee73e60e87915bd3027a774e24d3ac5124`는 artifact 생성 전에 exactly-one-line UTF-8 decoding과 claim equality를 fail closed로 강제했다. Edge-coverage exact `920eb7be0c3f57c5f149328a08beddc13339a338`은 LF/CRLF/unterminated line, paraphrase mismatch, embedded multi-line bytes와 invalid UTF-8 edge를 추가로 고정했다.

Exact `920eb7be...`는 이후 실제 hosted reviewer-ci RED를 만들었다. Run `34190991526`, job `101948849348`에서 exact checkout, noema-core 100% line+branch coverage와 100% docstring gate는 통과했지만 reviewer suite가 **1 failed / 721 passed**로 종료됐다. 전체 reviewer coverage는 100%였다. 실패는 `test_caller_owned_kind_prevents_source_receipt_from_authorizing_execution`의 `_source_bundle()`이 production exact-line invariant 도입 뒤에도 runtime paraphrase `CLAIM`을 `b"cargo generate-lockfile --locked\n"`와 결합하던 stale fixture였다. Production invariant를 약화하지 않았다.

Causal test repair `1cd8db5a94ed420bed8b52be0d3b3354f9fc86ab`은 source receipt의 claim을 exact decoded line `cargo generate-lockfile --locked`로 맞추면서도 caller-owned `EvidenceKind.EXECUTION` 요구와 source receipt 사이의 kind-mismatch 거부를 그대로 검증한다. Fresh review는 이어 `reviewer/tests/test_claim_evidence_publication_boundary.py`의 unused `claim_evidence_runtime` import를 유효 finding으로 보고했고, no-behavior-change repair `809ccb78bfdf8f9785d4c74ab834159961cce6e9`에서 그 import만 제거했다. 해당 review thread는 새 exact head에서 resolved/outdated가 됐다.

Current #556 exact generation은 application CI `34193084836`, reviewer-ci `34193084831`, required Security Scan `34193084827`, patch-validator-image `34193084840`이다. 이 revision 작성 시 CI/reviewer/Security는 queued, image는 pending이며 predecessor evidence는 passing으로 전용하지 않는다. Default `main` retarget 뒤 required Security Scan이 실제 materialize되므로, 이전 stacked-head Security absence는 이 concrete PR의 현재 gate exemption이 아니다. Central `.github#2037`은 future genuinely stacked PR에 대한 별도 owner-path defect로 남긴다.

Remaining supply-chain boundary는 exact stdout/stderr handoff, trusted research producer, immutable Noema release, released central `.github#1641` consumer bump와 unchanged original/synonym corpus RED→GREEN이다.

### Cross-lane documentation authority — PR #559

#559는 이 baseline과 다섯 executable documentation-authority tests의 sole writer다. #535 normal integration과 #556 current-head mutation을 반영해 protected source와 active-candidate identity를 다시 수렴시킨다. Feature-lane source, historical #556 baseline blob이나 predecessor gate result를 #559 authority로 전용하지 않는다. #559 자신의 source mutation도 predecessor workflow evidence를 무효화하므로 final exact head에서 fresh CI/reviewer/Security/image가 필요하다.

## Protected but incomplete commercial evidence

### Orchestrator/free consumer — merged #535

Merged PR #535 exact `82b20b293f0a5f0ac0e69857c1b61dddfe478491`는 protected `main@0dbfceb850cda3a016ceb39ae1c8a1a96a9f2ad5`에 normal integration됐다. Exact candidate가 application CI/reviewer-ci/required Security/patch-validator-image terminal SUCCESS와 clean review authority를 충족한 뒤 merge됐으며, provider/model routing은 `contextual-orchestrator` owner에 남고 Noema는 `orchestrator/free`와 gateway-only credentials를 소비한다. Source integration 자체는 immutable Noema package/release, SBOM/provenance/reproducibility 또는 downstream consumer activation을 증명하지 않는다.

### Patch-validator default-branch cache seed — merged #558 / issue #66

Merged PR #558 exact `2f91bf8641212ecae435b5fbcc9084cc0acd6295`는 protected source에 포함됐다. Protected-main prior push `patch-validator-image` run `34179912851`은 terminal SUCCESS다. 따라서 operational/cache-seed workflow execution은 실제 완료됐지만, 그 성공만으로 cache hit 성능, immutable image digest publication, signature/attestation, reproducibility 또는 rollback을 증명하지 않는다. Issue #66은 immutable publication evidence가 source/run identity와 결합될 때까지 open authority다.

### Toolchain and inbound rights — issue #531 / merged #540

Source remediation은 protected lineage에 있다. 남은 권위는 exact released package/image/SBOM/provenance/reproducibility, NOTICE/attribution, actual artifact rights와 explicit owner/legal outbound-rights evidence다. Source-only license inventory를 release evidence로 승격하지 않는다.

### Durable runtime operation — issue #541 / merged #542

Durable workflow/state source는 protected lineage에 있다. 남은 권위는 deployed Durable Object binding/transaction compatibility, recovery/rollback receipt, immutable release/package/SBOM/provenance/reproducibility다. 이 evidence 전까지 ADR 0013은 `Proposed`다.

### Governance and production identity

Required workflow source만으로 reviewer/maintainer App installation, key custody/rotation, bounded publication authority, ruleset enforcement, break-glass operation을 모두 입증할 수 없다. Live governance와 approved control-plane evidence는 source evidence와 별도로 유지한다.

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
| Exact-claim receipts | observed PR #556 exact `809ccb78bfdf8f9785d4c74ab834159961cce6e9` | fresh Security-inclusive exact-head gates, clean review, normal merge, execution/research producer evidence, immutable release |

## Evidence semantics and merge rules

A PR can be review-clean while non-authorizing. Review thread resolution, CI, reviewer-ci, required Security Scan, image/SBOM/provenance and branch ancestry are separate evidence classes. Every source mutation or restack invalidates predecessor workflow evidence. `queued`, `pending`, `in_progress`, `skipped`, `cancelled`, stale or absent-required evidence is not passing.

Normal merge requires unchanged exact head, independently refreshed live base/head, no valid unresolved review finding, applicable required terminal-success gates and no foreign-owner/protected-contract regression. Concurrent commits or pushes are not called a race merely because they occur. Wrong base/conflict, stale ADR identity, mutable dependency, missing fixture/contract or single-writer violation is repaired by ordinary/non-force semantic convergence rather than force push, destructive rebase or casual Close.

PR 0은 useful work를 닫아 제조하지 않는다. Open lane은 normal merge 또는 verified successor가 모든 유효 delta/test/fixture/contract/evidence를 완전히 승계한 경우에만 사라진다. Blocked lane은 자기 lane만 막고 unrelated safe review, owner-path repair, docs-to-code repair와 buyer-gap work는 계속한다.

## Buyer and operator gaps

| Priority | Gap | Buyer/operator impact | Current owner | Authoritative completion evidence | Next executable action |
| --- | --- | --- | --- | --- | --- |
| P0 | Exact-claim evidence supply chain | Tool/research claim이 producer evidence 없이 reviewer authority로 승격되거나 source claim이 cited line과 분리되면 blocking review가 잘못 권위화될 수 있다. | issue #555 / PR #556 | exact source-claim binding + execution/research producer evidence + fresh gates + normal merge + immutable release + released consumer RED→GREEN | exact `809ccb78...` gates/review 확인; failure면 causal repair, four-GREEN이면 normal merge |
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
