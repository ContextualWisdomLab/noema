# Noema Product and Technical Gap Baseline

## Authority and update rule

이 문서는 protected source, active candidate, transient workflow evidence와 foreign-owner authority를 분리한다. Open PR exact head, protected base, required workflow, review thread, release와 central dependency는 mutation·merge·release 직전에 다시 읽는다. predecessor GREEN, queued/pending/in-progress/skipped/cancelled run, 오래된 PR base snapshot과 scanner/model judgement는 다음 revision의 merge authority로 전용하지 않는다.

Current protected source는 GitHub-verified protected `main@0dbfceb850cda3a016ceb39ae1c8a1a96a9f2ad5`다. Current source SHA는 moving observation이며 future merge 뒤 evergreen identity로 취급하지 않는다. 이 protected revision에는 merged PR #535 exact `82b20b293f0a5f0ac0e69857c1b61dddfe478491`의 strict `orchestrator/free` consumer와 provider-endpoint fail-closed contract가 포함돼 있다.

이 revision 작성 시 moving central control-plane snapshot은 central `.github/main@7fd571dbcdbae6acf29d8f4ee704d7ba6297e4db`다. Noema runtime의 reviewed immutable central consumer pin은 `c9052e607e5f3cc76e73207e7786b21500721b79`이고 runtime authority 표현은 `ALLOWED_WORKFLOW_SHA = c9052e607e5f3cc76e73207e7786b21500721b79`다. Moving foreign head와 reviewed immutable pin을 같은 권위로 취급하지 않으며, central moving head가 전진했다고 Noema consumer pin을 자동 승격하지 않는다.

Protected history에는 merged PR #547 exact `30b7e7e5cdab8de65715834a16f994b2047eafa6`, merged PR #540 exact `05bc2d47c3899ebe17538070f9a30172f90307ac`, merged PR #542 exact `ca839298fcaeec409091dc909789b6f87eb67fdc`, merged PR #550 exact `f2ec2dc6709814070cc3e3d6932ce280aee966db`, merged PR #553 exact `3bd9f543e97ce856f78b1c608141436298ce9e74`, merged PR #558 exact `2f91bf8641212ecae435b5fbcc9084cc0acd6295`가 포함돼 있다. 이 SHA들은 역사 증거이지 open-candidate authority가 아니다.

#559가 `docs/product-technical-gap-baseline.md`와 executable documentation-authority tests의 sole writer다. 다른 feature lane의 과거 baseline blob은 ordinary/non-force semantic convergence 때 current authority로 승계하지 않는다.

## Canonical product boundary

Noema Core Domain은 **Agent Runtime**과 **Workflow / Task Execution**이다. **Tool / Capability Boundary**, **State / Checkpoint**, **Isolation Integration**, **Policy / Approval**, **Observability**, **Recovery**는 명시적 bounded context다. Execution identity, side-effect authority, claim/checkpoint CAS, cancellation/recovery invariant는 Noema transaction boundary에 남긴다.

`contextual-orchestrator`는 provider/model discovery, routing, retry/failover, test-time compute와 provider credential을 소유한다. Noema는 released gateway contract와 canonical `orchestrator/free` alias를 소비할 뿐 direct provider SDK, provider key, provider/model/group fallback policy를 소유하지 않는다. `.github`는 organization reusable workflow/control-plane source, Keyverse는 identity backend, `quarantine-sandbox-runtime`·Wardnet·EgressWeave·AppGuardrail은 각자의 isolation/security/outbound truth를 소유한다. `context-graph-contracts`와 `enterprise-architecture-core`는 released/versioned contract로만 연결하며 mutable sibling PR source, copied domain table, cross-service SQL을 runtime truth로 쓰지 않는다.

#550은 PR-scoped supersession cancellation과 work-conserving dispatch를 protected source에 통합했다. #542는 Durable Workflow / Task Execution과 State / Checkpoint의 atomic task claim, checkpoint CAS/replay, effect-start/terminal authority, cancellation/recovery와 retained-provenance validation을 protected source로 만들었다. ADR 0013은 deployed Durable Object transaction/runtime evidence가 없으므로 `Proposed`다. #540은 historical Wrangler/Miniflare/Sharp/Libvips tooling path를 제거하고 pinned `workerd@1.20260625.1` + `esbuild@0.28.1`과 canonical lock/license evidence를 protected source에 통합했다.

## Active candidate convergence — 2026-09-08 KST

### Exact-claim evidence receipts — issue #555 / PR #556

Observed PR #556 exact `860714cba46dba06260a5dce09d0e9152fcb0a8c`는 Draft이고 default `main`을 base로 한다. Prerequisite #535는 protected source에 정상 통합됐고 #556은 그 위의 ahead-only candidate다. `live #556 must be re-fetched before integration`이며 predecessor head의 workflow/review evidence를 current authority로 전용하지 않는다.

#556은 authenticated producer receipt와 `ClaimEvidenceRequirement` publication authority를 분리한다. Raw source receipt는 context authority일 뿐이고 requirement/receipt mismatch, wrong coordinates, direct model dictionaries, context-to-finding promotion은 deterministic gate와 publisher 전에 fail closed한다.

Test-only `dbab4cdc150d4973002f8b61173282f7c7542725`는 claim이 exact source line에서 파생돼야 한다는 regression contract를 추가했다. Production `440346ee73e60e87915bd3027a774e24d3ac5124`는 exactly-one-line UTF-8 decoding과 claim equality를 fail closed로 강제했다. Edge exact `920eb7be0c3f57c5f149328a08beddc13339a338`의 hosted reviewer-ci RED는 Run `34190991526`, job `101948849348`에서 **1 failed / 721 passed**로 종료됐고, stale fixture만 고친 causal repair는 `1cd8db5a94ed420bed8b52be0d3b3354f9fc86ab`이다. 후속 publisher boundary는 finding-free non-approval을 거부하도록 보강됐다.

Current #556 generation은 application CI `34197596549`, reviewer-ci `34197596588`, required Security Scan `34197596536`, patch-validator-image `34197596517`이다. Fresh read에서 CI/reviewer/Security는 terminal SUCCESS이고 image만 in progress라 3-GREEN이지 four-GREEN이 아니다. Exact stdout/stderr producer, trusted research producer, immutable Noema release, released central consumer와 unchanged original/synonym corpus RED→GREEN은 별도 completion evidence다.

### External extension admission — issue #545 / PR #560

Observed PR #560 test-only exact `7ca9aebee6f92053913c0bbc665c8de77650891f`는 Draft이고 default `main`을 base로 한다. Production predecessor #560 exact `81bff2f61ab6c323845116acd9622334f9dcfadd`는 Tool / Capability source identity, runtime-issued admission/activation/invocation receipt provenance, live AppGuardrail/quarantine receipt re-resolution을 구현한 마지막 production tree다. ADR 0015는 계속 `Proposed`다.

이 lane의 기존 실제 RED에는 missing public-doc gate, catalog identity drift, forged activation, fabricated admitted object, field-identical activation/receipt clone과 owner-receipt revocation TOCTOU가 있다. 특히 test-only `58f8bbadd6a4a3863d642883e40f4753f6dc291f`의 hosted application CI `34197933796`은 4 / 4167 release-test failures를 만들었고, 후속 production은 six-field identity를 재검증해 `catalog drift cannot silently update an admitted extension` invariant를 완성했다. Production predecessor의 focused local evidence는 34 passed, owned production 100%, typecheck/diff-check GREEN이었지만 hosted four-GREEN을 뜻하지 않는다.

#### Current Policy / Approval issuance RED

Fresh source review는 `ExternalExtensionAuthority`가 source/catalog identity와 AppGuardrail/quarantine scan receipt만 신뢰하고, `approval_status`, `allowed_product_repositories`, `allowed_execution_roles`, validity와 policy scope는 untrusted descriptor에서 그대로 받는 결함을 찾았다. Module-private WeakSet은 객체가 admission 함수를 통과했다는 사실만 증명하며 product grant 내용이 Noema Policy / Approval owner에게서 발급됐다는 사실은 증명하지 않는다.

Current test-only `7ca9aebee6f92053913c0bbc665c8de77650891f`의 `test/external-extension-policy-authority.test.ts`는 exact source/catalog/scan pins를 고정한 채 product/role/status만 self-broaden하고, independently trusted Policy / Approval issuance가 없으면 admission이 fail closed해야 한다고 요구한다. Current generation은 application CI `34206149899`, reviewer-ci `34206149930`, required Security Scan `34206149849`, patch-validator-image `34206149861`이며 fresh read에서 모두 queued라 hosted RED를 아직 주장하지 않는다.

Minimum causal fix는 product/role/status/validity/policy grant를 별도의 pinned Noema Policy / Approval authority 또는 receipt에 결합하는 것이다. Anthropic catalog, AppGuardrail/quarantine scan receipts, `Readonly`/freeze, in-process object provenance를 product-approval truth로 과승격하지 않는다. Provider routing은 contextual-orchestrator, scanner/isolation/egress는 각 canonical owner에 남긴다.

### Cross-lane documentation authority — PR #559

#559는 baseline과 다섯 executable documentation-authority tests만 소유한다. Earlier exact `44d2050804ef1d167b2170dcf6fc31657900b9f6`의 application CI `34193418411`은 문장 casing을 과도하게 고정한 test oracle 때문에 release tests 1건이 실패했고 `9c14c4e2e5d7fb0d51e0510ea3489d42ba4df0e8`이 그 oracle만 수리했다.

#560이 production `81bff2f...`로 전진했을 때 #559는 `e86592848162e68e7001e8acb54bd2973ac6bb40` test-only → `595f1f78413ecf934d5fc4476c31dd2e44d43186` production documentation convergence를 수행했다. 이후 #560에서 새 Policy / Approval RED가 발견돼 test-only `e5bcc305bf6f3f40033a015c5f8087ec62025ce1`이 active exact `7ca9aeb...`를 다시 executable authority로 요구한다. 이 문서 revision은 그 active RED를 code-current하게 반영한다. Feature source와 predecessor gate는 #559로 복사하지 않는다.

## Current authority table

| Lane | Authority | Integration / completion condition |
| --- | --- | --- |
| Protected source | protected `main@0dbfceb850cda3a016ceb39ae1c8a1a96a9f2ad5` | mutation·merge·release 직전 exact protected head 재조회 |
| Central workflow trust | central `.github/main@7fd571dbcdbae6acf29d8f4ee704d7ba6297e4db`; reviewed pin `c9052e607e5f3cc76e73207e7786b21500721b79` | moving head와 immutable reviewed pin 분리 |
| Toolchain/license source | merged PR #540 exact `05bc2d47c3899ebe17538070f9a30172f90307ac` | release/publication/rights evidence 미완료 |
| Durable workflow/state source | merged PR #542 exact `ca839298fcaeec409091dc909789b6f87eb67fdc` | deployed runtime/recovery/release evidence 미완료 |
| Documentation authority | merged PR #547 exact `30b7e7e5cdab8de65715834a16f994b2047eafa6` + active #559 successor | moving PR/protected/central truth code-current 유지 |
| Orchestrator/free consumer | merged PR #535 exact `82b20b293f0a5f0ac0e69857c1b61dddfe478491` | immutable Noema release + released consumer evidence 미완료 |
| Patch-validator cache seed | merged PR #558 exact `2f91bf8641212ecae435b5fbcc9084cc0acd6295`; protected run `34179912851` SUCCESS | immutable image/release evidence 미완료 |
| Exact-claim receipts | observed PR #556 exact `860714cba46dba06260a5dce09d0e9152fcb0a8c` | image terminal success + clean review + normal merge + execution/research producer + immutable release |
| External extension admission | observed PR #560 test-only exact `7ca9aebee6f92053913c0bbc665c8de77650891f`; production predecessor `81bff2f61ab6c323845116acd9622334f9dcfadd` | Policy / Approval RED→minimum fix→fresh four-GREEN→clean review→normal merge; immutable shared owner/live pilot evidence remains separate |

## Evidence semantics and merge rules

A PR can be review-clean while non-authorizing. Review resolution, CI, reviewer-ci, required Security, image/SBOM/provenance, branch ancestry와 release는 separate evidence classes다. Every source mutation/restack invalidates predecessor workflow evidence. `queued`, `pending`, `in_progress`, `skipped`, `cancelled`, stale 또는 absent-required evidence는 passing이 아니다.

Normal merge requires unchanged exact head, independently refreshed live base/head, no valid unresolved review finding, applicable required terminal-success gates and no foreign-owner/protected-contract regression. Concurrent commits나 pushes 자체를 race로 단정하지 않는다. Wrong base/conflict, stale ADR, mutable dependency, missing fixture/contract, single-writer 위반은 force push나 destructive rebase가 아니라 ordinary/non-force semantic convergence로 수리한다.

PR 0은 useful work를 닫아 제조하지 않는다. Open lane은 normal merge 또는 verified successor가 모든 유효 delta/test/fixture/contract/evidence를 완전히 승계한 경우에만 사라진다. Blocked lane은 자기 lane만 막고 unrelated safe review, owner-path repair, docs-to-code repair와 buyer-gap work는 계속한다.

## Commercial gap register

| Priority | Gap | Buyer/operator impact | Current owner | Authoritative completion evidence | Next executable action |
| --- | --- | --- | --- | --- | --- |
| P0 | Exact-claim evidence supply chain | Tool/research claim이 producer evidence 없이 reviewer authority가 될 수 있다. | issue #555 / PR #556 | source binding + non-vacuous findings + producer evidence + fresh gates + normal merge + immutable release + released consumer RED→GREEN | exact `860714c...` image/review 재조회; four-GREEN이면 protected ancestry 확인 후 normal merge |
| P0 | External extension capability admission | third-party plugin metadata/prompt/hook 또는 self-asserted product grant가 runtime authority가 될 수 있다. | issue #545 / PR #560 | immutable source + independent scan + independently issued Policy / Approval grant + live revalidation + no undeclared capability + fresh gates/review + normal merge + immutable shared contract | exact `7ca9aeb...` hosted RED 확인 후 minimum Policy / Approval issuance binding |
| P0 | Strict orchestrator/free consumer release | Source 통합만으로 immutable consumer activation을 증명할 수 없다. | merged #535 + release lane | exact release/tag/package/SBOM/provenance/reproducibility + released consumer | release-ready protected head에서만 publication |
| P0 | Patch-validator operational publication | source merge와 한 번의 image run만으로 reusable immutable runtime을 증명할 수 없다. | issue #66 | protected execution + immutable image/signature/SBOM/provenance/reproducibility/rollback | immutable publication evidence와 결합 |
| P0 | Toolchain/license release evidence | source dependency remediation만으로 배포 artifact 권리/재현성을 증명할 수 없다. | issue #531 | package/image/SBOM/provenance/reproducibility/NOTICE/rights | release-ready exact head에서만 생성 |
| P0 | Reviewer/Maintainer production identity | source control만으로 App installation, key custody/rotation, bounded publication authority를 증명할 수 없다. | issues #29 / #227 | live installation/permissions/key-custody/rotation + publication/recovery receipt | control-plane evidence와 source evidence 분리 |
| P0 | Governance enforceability | workflow source만으로 approval/deletion/rewrite/break-glass 정책 전체를 증명할 수 없다. | issue #27 | live ruleset/protection audit + observed required-workflow behavior | protected mutation 직전 재조회 |
| P1 | Durable runtime operation | source-level durable semantics와 deployed transaction/recovery는 별도 evidence다. | issue #541 | deployed compatibility + recovery/rollback + immutable release | ADR 0013 Proposed 유지 |
| P1 | Production KPI evidence | fixture는 reliability, latency, commercial operation을 입증하지 못한다. | issue #3 | authenticated retained KPI window + source/run identity + denominator | approved production source 없으면 fail closed |
| P1 | Acquisition transfer | Apache-2.0 source grant는 contributor ownership/assignment/artifact-transfer rights 자체를 증명하지 않는다. | issue #5 | exact-release rights metadata + NOTICE/SBOM + contributor/IP transfer evidence | immutable release 이후 수집 |

## Completion discipline

각 gap은 authoritative completion evidence가 실제로 존재하고 current source/head에 결합될 때만 닫는다. 문서 존재, synthetic fixture, model judgement, stale workflow result를 완료 증거로 사용하지 않는다. Release-ready exact protected head가 없으면 version/tag/package/SBOM/provenance/rollback을 제조하지 않는다.
