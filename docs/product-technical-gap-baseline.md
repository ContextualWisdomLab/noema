# Noema Product and Technical Gap Baseline

## Authority and update rule

이 문서는 Noema의 protected truth, active candidate, transient workflow evidence, foreign-owner authority를 분리한다. 저장소 문서나 테스트가 특정 revision의 사실을 기록하더라도 predecessor GREEN, queued/skipped/cancelled run, 오래된 PR base snapshot, scanner/model judgement는 다음 revision의 merge authority로 전용하지 않는다. Open PR의 exact head, live base, required workflow, review thread, central dependency는 mutation·merge·release 직전에 다시 조회한다.

이 #547 candidate를 current protected tree에 수렴시킨 construction snapshot은 GitHub-verified protected `main@099d7d89a51bca4a2cf7c6b285b50ffadd08d001`이다. 이 SHA를 merge 이후의 evergreen `current main`으로 취급하지 않는다. Current protected source identity는 mutation·merge·release 직전에 live-read한다. Construction snapshot ancestry에는 merged PR #536 exact `4fe6fe84611dfa1d69d8e0712b72b278429524d0`, merged PR #548 exact `fb44888bd571cae61dbfc93c1b46675855fbfc9c`, merged PR #550 exact `f2ec2dc6709814070cc3e3d6932ce280aee966db`, merged PR #553 exact `3bd9f543e97ce856f78b1c608141436298ce9e74`, merged PR #542 exact `ca839298fcaeec409091dc909789b6f87eb67fdc`, merged PR #540 exact `05bc2d47c3899ebe17538070f9a30172f90307ac`의 유효 delta가 포함돼 있다.

#542는 Durable Workflow / Task Execution과 State / Checkpoint의 atomic claim, checkpoint CAS/replay, effect-start/terminal authority, cancellation/recovery 및 retained-provenance validation을 protected source로 만들었다. ADR 0013은 배포된 Durable Object transaction/runtime 증거가 아직 없으므로 `Proposed`를 유지한다. #540은 historical Wrangler/Miniflare/Sharp/Libvips tooling path를 제거하고 pinned `workerd@1.20260625.1` + `esbuild@0.28.1`, canonical lock/license evidence와 patch-validator dependency pruning을 protected source로 만들었다. Source integration은 immutable release rights, NOTICE/attribution, SBOM/provenance publication을 자동으로 증명하지 않는다.

이 candidate construction 시 관찰한 moving central control-plane snapshot은 central `.github/main@78a4937c684a54ca8e415822c913742f41c6efc4`다. 이 SHA 역시 foreign owner의 evergreen current head로 간주하지 않고 consumer mutation 직전에 live-read한다. Noema protected runtime의 reviewed immutable consumer pin은 `c9052e607e5f3cc76e73207e7786b21500721b79`이며 runtime authority 표현은 `ALLOWED_WORKFLOW_SHA = c9052e607e5f3cc76e73207e7786b21500721b79`다. Moving central main과 reviewed immutable consumer source identity를 같은 권위로 취급하지 않는다.

`docs/product-technical-gap-baseline.md`의 cross-lane source writer는 PR #547 하나다. 다른 feature lane이 과거 baseline blob을 포함하더라도 ordinary/non-force semantic convergence 때 current authority로 승계하지 않는다.

## Canonical product boundary

Noema Core Domain은 **Agent Runtime**과 **Workflow / Task Execution**이다. **Tool / Capability Boundary**, **State / Checkpoint**, **Isolation Integration**, **Policy / Approval**, **Observability**, **Recovery**는 명시적 bounded context다. Execution identity, side-effect authority, claim/checkpoint CAS, cancellation/recovery invariant는 Noema transaction boundary에 남긴다.

`contextual-orchestrator`는 provider/model discovery, routing, retry/failover, test-time compute와 provider credential을 소유한다. Noema는 released gateway contract와 canonical `orchestrator/free` alias를 소비할 뿐 direct provider SDK, provider key, provider/model/group fallback policy를 소유하지 않는다. `.github`는 organization reusable workflow와 control-plane source를 소유한다. `quarantine-sandbox-runtime`, Wardnet, EgressWeave, AppGuardrail은 isolation/security/outbound truth를 각자 소유한다. Keyverse는 identity backend owner다. `context-graph-contracts`와 `enterprise-architecture-core`는 released/versioned contract로만 연결하며 mutable sibling PR source, copied domain table, cross-service SQL은 runtime truth가 아니다.

Protected lineage의 #550은 PR-scoped supersession cancellation과 work-conserving dispatch를, #553은 automation threat-model documentation contract를, #542는 Durable Object state binding/routing과 durable state-store source를, #540은 current tooling/license source boundary를 통합했다. 이 네 lane은 active merge candidate가 아니다. 특히 #542 source integration은 runtime deployment·compatibility·transaction evidence까지 제조하지 않으며 #540 source integration은 release/publication rights까지 제조하지 않는다.

## Active candidate convergence — 2026-09-08 KST

### Orchestrator/free consumer — PR #535

PR #535 exact `e996b509f699c3f942ef81f0ac52b804b783cd19`는 Draft이며 construction snapshot protected main과 diverged 상태다. Hosted CI `34132537891`은 exact checkout과 package-manager setup 뒤 live pull-request base guard에서 실패했다. 이는 stale-ancestry RED다. 해당 head를 rerun하거나 guard를 약화하지 않는다.

Valid source delta는 merge-base `e6de53a1c2902cddc09e77a58efb82420cd8f5db` 이후 37개 path다. 다음 successor는 mutation 시점의 live protected main에서 시작해 protected work-conserving concurrency/admission, #542 durable workflow/state, `noema-core` Shared Kernel, #540 toolchain/license truth와 actionable failed-check/source-evidence behavior를 보존하면서 strict `orchestrator/free`, request-level ZDR/privacy, `timeout=None`, `max_retries=0`, gateway validation과 direct-provider/fallback rejection delta만 ordinary/non-force semantic convergence해야 한다.

Historical overlap path는 `.github/workflows/hourly-product-development.yml`, `docs/operations/hourly-product-development.md`, `test/documentation-architecture-contract.test.ts`, `test/helpers/hourly-workflow.ts`, `test/hourly-product-development-final-candidate-cleanup.test.ts`, `test/hourly-product-development-workflow.test.ts`다. Stale candidate의 zero-open-PR/scheduled semantics로 protected work-conserving source를 되돌리지 않는다. 특히 model-bearing proposer는 canonical `orchestrator/free`를 source-pin하고 repository-authored model inference timeout/retry를 두지 않되 current path-isolation/single-flight contract를 보존한다.

### Exact-claim evidence receipts — issue #555 / PR #556

Observed PR #556 exact `fecb03d9c632f90f290f921c1d6e90ce86ca5305`는 live #535가 아닌 과거 feature-base snapshot 위에 있다. `live #556 must be re-fetched before integration`. Hosted CI `34089768682`의 live-base RED와 absent Security evidence 때문에 이 exact head는 non-authorizing이다. #535가 fresh exact-head four-GREEN으로 normally integrate된 뒤에만 protected main과 live #556을 다시 읽고 ordinary/non-force restack/retarget한다.

#556이 소유하는 source contract는 producer-issued evidence receipt, exact repository/head/workflow/run/attempt identity, claim/evidence digest, evidence-kind separation, model-visible `[receipt:<id>]` reference와 pre-publication admission이다. Source receipt는 execution/research authority가 아니다. Remaining boundary는 exact stdout/stderr handoff, trusted research producer, fresh Security 포함 exact-head gates, immutable Noema release, released central `.github#1641` consumer bump와 original corpus RED→GREEN이다.

### Cross-lane baseline — PR #547

PR #547은 이 문서와 executable documentation authority contract의 sole writer다. 이 revision은 #540을 active candidate로 잘못 남겨 둔 stale baseline을 수리하고 protected integration과 current open lane을 다시 분리한다. #547 자신의 future commit SHA나 merge commit SHA를 evergreen current authority로 문서에 고정하지 않는다. Exact source/head/check/review evidence는 merge 직전에 live-read한다.

## Protected but incomplete commercial evidence

### Toolchain / inbound license — issue #531 / merged PR #540

Merged PR #540 exact `05bc2d47c3899ebe17538070f9a30172f90307ac`의 source remediation은 construction snapshot protected lineage에 이미 포함돼 있다. 따라서 더 이상 #540 merge를 buyer gap의 next action으로 요구하지 않는다. 남은 권위는 protected-source package/SBOM/provenance/reproducibility, NOTICE/attribution, actual released-artifact rights와 explicit owner/legal outbound-rights evidence다. Source-only license inventory나 PR-head image check를 release evidence로 승격하지 않는다.

### Durable runtime operation — issue #541 / merged PR #542

Merged PR #542 exact `ca839298fcaeec409091dc909789b6f87eb67fdc`는 durable workflow/state source를 protected lineage에 넣었다. 남은 권위는 실제 deployed Durable Object binding/transaction compatibility, recovery/rollback receipt, immutable release/package/SBOM/provenance/reproducibility다. ADR 0013은 이 evidence가 존재하기 전까지 `Proposed`다.

## Current authority table

| Lane | Authority | Integration / completion condition |
| --- | --- | --- |
| Protected source | live protected `main`; #547 construction snapshot used protected `main@099d7d89a51bca4a2cf7c6b285b50ffadd08d001`; merged #536/#548/#550/#553/#542/#540 | Current exact protected head is live-read before every mutation, merge and release. Construction SHA is historical evidence, not evergreen current-main identity. |
| Central workflow trust | moving central main is live-read; construction snapshot central `.github/main@78a4937c684a54ca8e415822c913742f41c6efc4`; reviewed Noema consumer pin `c9052e607e5f3cc76e73207e7786b21500721b79` | Moving foreign head and immutable reviewed pin stay distinct. |
| Toolchain/license source | merged PR #540 exact `05bc2d47c3899ebe17538070f9a30172f90307ac` | Source complete; #531 remains open for protected release/publication/rights evidence. |
| Durable workflow/state source | merged PR #542 exact `ca839298fcaeec409091dc909789b6f87eb67fdc` | Source complete; #541 remains open for deployed runtime/recovery/release evidence. |
| Orchestrator/free consumer | PR #535 exact `e996b509f699c3f942ef81f0ac52b804b783cd19` | Live-base RED; semantic convergence onto live protected main before fresh four-GREEN. |
| Exact-claim receipts | observed PR #556 exact `fecb03d9c632f90f290f921c1d6e90ce86ca5305` | Wait for #535 normal integration, then live-read/restack and fresh Security-inclusive evidence. |
| Cross-lane baseline | PR #547 | Sole writer; docs/contracts change together and require wholly fresh exact-head evidence. |

## Evidence semantics and merge rules

A PR can be review-clean while non-authorizing. Review thread resolution, CI, reviewer-ci, required Security Scan, image/SBOM/provenance and branch ancestry are separate evidence classes. Every source mutation or restack invalidates predecessor workflow evidence. `queued`, `pending`, `in_progress`, `skipped`, `cancelled`, stale or absent-required evidence is not passing.

Normal merge requires unchanged exact head, independently refreshed live base/head, no valid unresolved review finding, applicable required terminal-success gates and no foreign-owner/protected-contract regression. Concurrent commits or pushes are not called a race merely because they occur. Wrong base/conflict, stale ADR identity, mutable dependency, missing fixture/contract or single-writer violation is repaired by ordinary/non-force convergence rather than force push, destructive rebase or casual Close.

PR 0은 useful work를 닫아 제조하지 않는다. Open lane은 normal merge 또는 verified successor가 모든 유효 delta/test/fixture/contract/evidence를 완전히 승계한 경우에만 사라진다. Blocked lane은 자기 lane만 막고 unrelated safe review, owner-path repair, docs-to-code repair와 buyer-gap work는 계속한다.

## Buyer and operator gaps

| Priority | Gap | Buyer/operator impact | Current owner | Authoritative completion evidence | Next executable action |
| --- | --- | --- | --- | --- | --- |
| P0 | Strict orchestrator/free consumer | Noema가 provider/model routing authority를 복제하면 제품 경계와 운영 책임이 흐려진다. | PR #535 | Live protected main 위 semantic convergence + fresh exact-head CI/reviewer/Security/image + normal merge | #547가 stable protected ancestry를 만들면 stale head를 rerun하지 말고 37-path valid delta와 six protected-overlap path를 semantic union한다. |
| P0 | Exact-claim evidence supply chain | 외부 tool claim이 authenticated producer evidence 없이 reviewer authority로 승격될 수 있다. | issue #555 / PR #556 | #535 merge 후 current-main restack, execution/research producers, immutable release, released central consumer bump, original hosted corpus GREEN | #535 protected integration 전에는 #556을 움직이지 않는다. |
| P0 | Toolchain/license release evidence | Source dependency remediation만으로 구매자에게 실제 배포 artifact 권리와 재현성을 증명할 수 없다. | issue #531 / merged PR #540 | Protected exact release의 package/image/SBOM/provenance/reproducibility/NOTICE/rights evidence | Release-ready protected exact head가 존재할 때만 immutable publication evidence를 만든다. |
| P0 | Reviewer/Maintainer production identity | Source-only controls로 App installation, key custody/rotation, bounded publication authority를 증명할 수 없다. | issues #29 / #227 | Live installation/permissions/key-custody/rotation 및 bounded publication/recovery receipts | 승인된 control-plane preflight를 실행하고 source evidence와 분리 보존한다. |
| P0 | Governance enforceability | Required workflow source만으로 실제 approval/deletion/rewrite/break-glass 정책을 모두 증명할 수 없다. | issue #27 | Live ruleset/protection audit와 observed required-workflow behavior | protected mutation 직전 live governance를 다시 읽고 owner control에서만 수정한다. |
| P0 | Patch-validator publication | PR-head image success와 protected source만으로 immutable artifact activation을 증명할 수 없다. | issue #66 | Protected-main operational run + immutable image/signature/SBOM/provenance/reproducibility/rollback | Protected exact head에서 operational acceptance를 실행할 수 있는 authorized dispatch surface가 있을 때만 publication을 진행한다. |
| P1 | Durable runtime operation | Source-level durable semantics와 실제 deployed transaction/recovery는 다른 evidence class다. | issue #541 | Deployed Durable Object compatibility + recovery/rollback + immutable release identity | 승인된 runtime deployment evidence가 없으면 ADR 0013 `Proposed`를 유지한다. |
| P1 | Production KPI evidence | Fixture는 reliability, latency, commercial production operation을 입증하지 못한다. | issue #3 | Authenticated retained production KPI window with source/run identity and falsifiable denominator | 승인된 production source가 없으면 fail closed를 유지한다. |
| P1 | Acquisition transfer | Apache-2.0 source grant는 contributor ownership, assignment, artifact-transfer rights 자체를 증명하지 않는다. | issue #5 | Exact-release rights metadata, dependency/NOTICE/SBOM, contributor/IP and transfer evidence | Immutable release 이후 acquisition evidence를 해당 권위에서 수집한다. |

## Active exact-claim evidence chain — 2026-09-07 KST

| Boundary | Exact current evidence | Remaining authoritative action | Status |
| --- | --- | --- | --- |
| Consumer RED | `.github#1641@b8c986e2406beb37d254acd4c5df6389038b55f2`, hosted run `34073137064`: original Concept35 and synonym both reached provenance admission and failed with `DID NOT RAISE` | keep the original corpus RED until a released owner contract is consumed | RED preserved |
| Noema owner | stacked `noema#556` builds canonical artifacts that bind all receipt semantics; the production central workflow now creates bounded exact-head source receipts, attests the receipt manifest with the review manifest, exposes only exact receipt references to the model, admits model findings before deterministic gates/publication, and replaces unreceipted model summary/recommendation claims with receipt-kind-specific non-authoritative action text | adapt existing execution/research producers into the same manifest, exact-head CI/security/SBOM/provenance, normal parent integration, immutable release | Proposed; source path integrated and model prose de-authorized |
| Existing producer adapters | current-head source uses the canonical Noema producer and live checkout; execution must extend the existing `sandboxed_verify` result path; research must create a content-addressed retrieval artifact; path trust reuses the authenticated OpenCode manifest reader precedent | make execution/research publish canonical entries into the same attested manifest; do not translate marker text or model dictionaries into authority | Source integrated; execution/research not integrated |
| Central review consumer | no unreleased Noema source is copied into `.github#1641` | verify immutable release, bump the consumer, bind trusted receipt manifest, rerun original RED cases | Blocked by owner release |

## Completion discipline

각 gap은 표의 Authoritative completion evidence가 실제로 존재하고 current source/head에 결합될 때만 닫는다. 문서 존재, synthetic fixture, model judgement, stale workflow result를 완료 증거로 사용하지 않는다. Release-ready exact protected head가 없으면 version/tag/package/SBOM/provenance/rollback을 임의로 제조하지 않는다.
