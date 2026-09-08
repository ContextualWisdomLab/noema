# Noema Product and Technical Gap Baseline

## Authority and update rule

이 문서는 Noema의 protected truth, active candidate, transient workflow evidence와 foreign-owner authority를 분리한다. Open PR exact head, protected base, required workflow, review thread, release와 central dependency는 mutation·merge·release 직전에 다시 읽는다. predecessor GREEN, queued/skipped/cancelled run, 오래된 PR base snapshot과 scanner/model judgement는 다음 revision의 merge authority로 전용하지 않는다.

Current protected source는 GitHub-verified protected `main@699489cdbb8de3404154d9a3d6022c692ce85fd6`이며 merged PR #547 exact `30b7e7e5cdab8de65715834a16f994b2047eafa6`의 documentation-authority delta를 포함한다. Current protected source identity는 mutation·merge·release 직전에 live-read한다. 이 SHA도 future merge 뒤의 evergreen current-main identity로 취급하지 않는다.

Construction snapshot 이력은 protected `main@099d7d89a51bca4a2cf7c6b285b50ffadd08d001`에서 #547을 수렴시킨 시점을 보존한다. 그 ancestry에는 merged PR #536 exact `4fe6fe84611dfa1d69d8e0712b72b278429524d0`, merged PR #548 exact `fb44888bd571cae61dbfc93c1b46675855fbfc9c`, merged PR #550 exact `f2ec2dc6709814070cc3e3d6932ce280aee966db`, merged PR #553 exact `3bd9f543e97ce856f78b1c608141436298ce9e74`, merged PR #542 exact `ca839298fcaeec409091dc909789b6f87eb67fdc`, merged PR #540 exact `05bc2d47c3899ebe17538070f9a30172f90307ac`가 포함돼 있다. Construction snapshot은 역사 증거이며 moving protected head를 고정하는 장치가 아니다.

이 revision 작성 시 마지막으로 관찰한 moving central control-plane snapshot은 central `.github/main@78a4937c684a54ca8e415822c913742f41c6efc4`다. Noema protected runtime의 reviewed immutable consumer pin은 `c9052e607e5f3cc76e73207e7786b21500721b79`이며 runtime authority 표현은 `ALLOWED_WORKFLOW_SHA = c9052e607e5f3cc76e73207e7786b21500721b79`다. Moving central main과 reviewed immutable consumer source identity를 같은 권위로 취급하지 않는다.

Merged #547은 이전 cross-lane baseline writer였고, 이 successor revision은 #547 protected integration 뒤 생긴 live authority 변화만 이어받는다. 다른 feature lane이 과거 baseline blob을 포함하더라도 ordinary/non-force semantic convergence 때 current authority로 승계하지 않는다.

## Canonical product boundary

Noema Core Domain은 **Agent Runtime**과 **Workflow / Task Execution**이다. **Tool / Capability Boundary**, **State / Checkpoint**, **Isolation Integration**, **Policy / Approval**, **Observability**, **Recovery**는 명시적 bounded context다. Execution identity, side-effect authority, claim/checkpoint CAS, cancellation/recovery invariant는 Noema transaction boundary에 남긴다.

`contextual-orchestrator`는 provider/model discovery, routing, retry/failover, test-time compute와 provider credential을 소유한다. Noema는 released gateway contract와 canonical `orchestrator/free` alias를 소비할 뿐 direct provider SDK, provider key, provider/model/group fallback policy를 소유하지 않는다. `.github`는 organization reusable workflow와 control-plane source를 소유한다. `quarantine-sandbox-runtime`, Wardnet, EgressWeave, AppGuardrail은 isolation/security/outbound truth를 각자 소유한다. Keyverse는 identity backend owner다. `context-graph-contracts`와 `enterprise-architecture-core`는 released/versioned contract로만 연결하며 mutable sibling PR source, copied domain table, cross-service SQL은 runtime truth가 아니다.

#550은 PR-scoped supersession cancellation과 work-conserving dispatch를 protected source에 통합했다. #535의 ordinary convergence는 이 protected work-conserving concurrency/admission을 보존한다. #542는 Durable Workflow / Task Execution과 State / Checkpoint의 atomic task claim, checkpoint CAS/replay, effect-start/terminal authority, cancellation/recovery 및 retained-provenance validation을 protected source로 만들었다. ADR 0013은 deployed Durable Object transaction/runtime 증거가 아직 없으므로 `Proposed`를 유지한다. #540은 historical Wrangler/Miniflare/Sharp/Libvips tooling path를 제거하고 pinned `workerd@1.20260625.1` + `esbuild@0.28.1`, canonical lock/license evidence와 patch-validator dependency pruning을 protected source에 통합했다.

## Active candidate convergence — 2026-09-08 KST

### Orchestrator/free consumer — PR #535

PR #535 exact `6739f0ab58e81dc56ea1485a5dea0f39e1cdfd3a`는 Draft다. #547이 protected source가 된 뒤 이전 four-GREEN head를 그대로 전용하지 않고, protected `main@699489cdbb8de3404154d9a3d6022c692ce85fd6`를 첫 parent, predecessor를 둘째 parent로 하는 ordinary/non-force semantic convergence를 수행했다. Fresh compare는 `behind_by=0`이고 merge-base가 current protected main과 일치한다.

Current exact delta는 strict `orchestrator/free`, request-level ZDR/privacy, reviewer `timeout=None`, `max_retries=0`, gateway validation, direct-provider/fallback rejection과 OpenCode tool-capability allowlisting을 소유한다. Provider/model discovery·routing·credential·retry/failover truth는 contextual-orchestrator owner에 남긴다. 마지막 관찰에서 application CI와 reviewer-ci는 terminal success, required Security는 queued, patch-validator-image는 in progress였다. predecessor GREEN은 transfer하지 않는다.

Next action은 unchanged exact head의 fresh four-GREEN, clean review authority와 current-base ancestry를 다시 확인한 뒤 normal merge하는 것이다. Check wait은 이 lane만 막는다.

### Patch-validator default-branch cache seed — issue #66 / PR #558

PR #558 exact `2f91bf8641212ecae435b5fbcc9084cc0acd6295`는 Draft이며 protected `main@699489cdbb8de3404154d9a3d6022c692ce85fd6` 위에 ordinary/non-force convergence된 `f2aa8570...`에서 test-only causal repair로 정상 전진했다. Fresh compare는 `behind_by=0`, merge-base exact protected main이며 effective diff는 `.github/workflows/patch-validator-image.yml`, `test/patch-validator-image-build-cache.test.ts`, `test/patch-validator-workflow.test.ts` 세 경로다.

RCA는 동일한 `type=gha,scope=noema-patch-validator-image` 문자열만으로 sibling PR cache가 공유된다는 가정을 반증했다. 기존 workflow는 PR branch와 manual dispatch에서만 cache를 기록해 sibling PR이 default/base branch cache로 복구할 수 없었고, successive exact-head static Node builds가 반복해서 cold path를 탔다. #558은 protected `main` push에서 image-authority path가 바뀔 때만 full image verification을 실행해 default-branch BuildKit cache를 seed하도록 한다. `workflow_dispatch`, PR-scoped cancellation, stale-head refusal, pinned scanners/toolchain, static runtime checks, no-network/non-root smoke, SBOM/vulnerability receipts와 fail-closed verification은 유지한다.

Converged predecessor `f2aa8570...`의 hosted CI `34172635652`는 exact checkout/live-base/lockfile/install/typecheck 뒤 release tests에서 현실 RED를 냈다. 원인은 기존 `patch-validator-workflow` contract가 unfiltered `pull_request:`를 검증한다는 명목으로 `workflow_dispatch:`와의 직접 인접성을 요구해, 별도 sibling `push:` trigger를 잘못 거부한 것이었다. Current `2f91bf8...`은 다음 non-empty event line이 같은 YAML indentation의 trigger임을 요구하도록 테스트를 일반화해 unfiltered PR invariant를 유지하면서 protected-main seed trigger를 허용한다. Production workflow·permission·security/publication boundary는 바꾸지 않았다. 새 exact head에는 application CI `34173491056`, reviewer-ci `34173491034`, required Security `34173491124`, patch-validator-image `34173491077`의 wholly fresh generation이 생겼고 마지막 관찰에서는 queued/pending이었다. predecessor GREEN은 transfer하지 않는다.

첫 repaired PR은 default-branch seed가 아직 없으므로 cold build를 지불할 수 있다. Normal #558 merge는 workflow path 자체를 변경하므로 protected merge commit에서 push image run을 한 번 보장한다. 그 run이 protected-main operational acceptance와 cache seed를 모두 실제로 통과하는지 확인하고, 이후 별도 image-authority PR에서 cache restore 및 실제 build duration을 측정하기 전에는 성능 개선을 주장하지 않는다.

### Exact-claim evidence receipts — issue #555 / PR #556

Observed PR #556 exact `fecb03d9c632f90f290f921c1d6e90ce86ca5305`는 현재 #535 feature-base보다 뒤처진 stale stacked head다. `live #556 must be re-fetched before integration`. Historical CI는 live-base guard에서 RED였고 required Security evidence가 없으므로 이 exact head는 non-authorizing이다.

#556이 소유하는 valid source contract는 producer-issued evidence receipt, exact repository/head/workflow/run/attempt identity, claim/evidence digest, evidence-kind separation, model-visible `[receipt:<id>]` reference와 pre-publication admission이다. Source receipt는 execution/research authority가 아니다. #535가 normal integrate된 뒤 protected main과 live #556을 다시 읽고, historical baseline/source blob을 복사하지 않은 채 receipt/test/fixture/contract delta만 ordinary/non-force restack/retarget한다. Fresh Security 포함 exact-head gates가 필요하다.

Remaining boundary는 exact stdout/stderr handoff, trusted research producer, immutable Noema release, released central `.github#1641` consumer bump와 original corpus RED→GREEN이다.

## Protected but incomplete commercial evidence

### Toolchain / inbound license — issue #531 / merged PR #540

Merged PR #540 exact `05bc2d47c3899ebe17538070f9a30172f90307ac` source remediation은 protected lineage에 포함돼 있다. 남은 권위는 protected-source package/SBOM/provenance/reproducibility, NOTICE/attribution, actual released-artifact rights와 explicit owner/legal outbound-rights evidence다. Source-only license inventory나 PR-head image check를 release evidence로 승격하지 않는다.

### Durable runtime operation — issue #541 / merged PR #542

Merged PR #542 exact `ca839298fcaeec409091dc909789b6f87eb67fdc`는 durable workflow/state source를 protected lineage에 넣었다. 남은 권위는 실제 deployed Durable Object binding/transaction compatibility, recovery/rollback receipt, immutable release/package/SBOM/provenance/reproducibility다. ADR 0013은 이 evidence가 존재하기 전까지 `Proposed`다.

### Patch-validator publication — issue #66

#547 exact head의 current static runtime/image/SBOM/receipt verification은 protected integration 전 terminal success를 얻었지만 PR-head evidence다. Protected-main operational run, immutable image digest publication, signature/attestation, source/workflow/builder provenance, reproducibility, rollback과 activation evidence는 아직 없다. GitHub release collection도 비어 있으므로 source integration을 release로 간주하지 않는다.

## Current authority table

| Lane | Authority | Integration / completion condition |
| --- | --- | --- |
| Protected source | live protected `main`; current observation protected `main@699489cdbb8de3404154d9a3d6022c692ce85fd6`; historical #547 construction snapshot protected `main@099d7d89a51bca4a2cf7c6b285b50ffadd08d001` | Exact protected head는 mutation·merge·release 직전에 live-read한다. |
| Central workflow trust | moving central main은 live-read; observed central `.github/main@78a4937c684a54ca8e415822c913742f41c6efc4`; reviewed Noema pin `c9052e607e5f3cc76e73207e7786b21500721b79` | Moving foreign head와 immutable reviewed pin을 분리한다. |
| Toolchain/license source | merged PR #540 exact `05bc2d47c3899ebe17538070f9a30172f90307ac` | Source complete; #531은 release/publication/rights evidence 때문에 open이다. |
| Durable workflow/state source | merged PR #542 exact `ca839298fcaeec409091dc909789b6f87eb67fdc` | Source complete; #541은 deployed runtime/recovery/release evidence 때문에 open이다. |
| Documentation authority | merged PR #547 exact `30b7e7e5cdab8de65715834a16f994b2047eafa6` + this post-integration successor | #547는 protected history다. Moving PR truth는 successor에서 code-current하게 갱신한다. |
| Orchestrator/free consumer | PR #535 exact `6739f0ab58e81dc56ea1485a5dea0f39e1cdfd3a` | Fresh exact-head four-GREEN + clean review + current ancestry 후 normal merge. |
| Patch-validator cache seed | PR #558 exact `2f91bf8641212ecae435b5fbcc9084cc0acd6295` | Fresh four-GREEN 후 normal merge; protected-main push image run과 cache seed를 별도 검증. |
| Exact-claim receipts | observed PR #556 exact `fecb03d9c632f90f290f921c1d6e90ce86ca5305` | #535 normal merge 뒤 live-read/restack, fresh Security-inclusive evidence와 immutable release. |

## Evidence semantics and merge rules

A PR can be review-clean while non-authorizing. Review thread resolution, CI, reviewer-ci, required Security Scan, image/SBOM/provenance and branch ancestry are separate evidence classes. Every source mutation or restack invalidates predecessor workflow evidence. `queued`, `pending`, `in_progress`, `skipped`, `cancelled`, stale or absent-required evidence is not passing.

Normal merge requires unchanged exact head, independently refreshed live base/head, no valid unresolved review finding, applicable required terminal-success gates and no foreign-owner/protected-contract regression. Concurrent commits or pushes are not called a race merely because they occur. Wrong base/conflict, stale ADR identity, mutable dependency, missing fixture/contract or single-writer violation is repaired by ordinary/non-force semantic convergence rather than force push, destructive rebase or casual Close.

PR 0은 useful work를 닫아 제조하지 않는다. Open lane은 normal merge 또는 verified successor가 모든 유효 delta/test/fixture/contract/evidence를 완전히 승계한 경우에만 사라진다. Blocked lane은 자기 lane만 막고 unrelated safe review, owner-path repair, docs-to-code repair와 buyer-gap work는 계속한다.

## Buyer and operator gaps

| Priority | Gap | Buyer/operator impact | Current owner | Authoritative completion evidence | Next executable action |
| --- | --- | --- | --- | --- | --- |
| P0 | Strict orchestrator/free consumer | Noema가 provider/model routing authority를 복제하면 제품 경계와 운영 책임이 흐려진다. | PR #535 | Fresh exact-head CI/reviewer/Security/image + normal merge | Current exact generation을 관찰하고 실패 시 causal repair; GREEN이면 current-base/review 재검증 후 normal merge. |
| P0 | Exact-claim evidence supply chain | Tool claim이 authenticated producer evidence 없이 reviewer authority로 승격될 수 있다. | issue #555 / PR #556 | #535 merge 후 current-main restack, execution/research producers, immutable release, released central consumer bump, original hosted corpus GREEN | #535 protected integration 전에는 #556을 움직이지 않는다. |
| P0 | Patch-validator operational publication | PR-head image success만으로 protected operation, reusable cache, immutable activation을 증명할 수 없다. | issue #66 / PR #558 | #558 merge + protected-main exact image run/cache seed + immutable image/signature/SBOM/provenance/reproducibility/rollback | #558 exact gates를 통과시키고 normal merge한 뒤 protected-main push run과 cache restore를 실측한다. |
| P0 | Toolchain/license release evidence | Source dependency remediation만으로 실제 배포 artifact 권리와 재현성을 증명할 수 없다. | issue #531 / merged PR #540 | Protected exact release package/image/SBOM/provenance/reproducibility/NOTICE/rights evidence | Release-ready protected exact head가 있을 때만 immutable publication evidence를 만든다. |
| P0 | Reviewer/Maintainer production identity | Source-only controls로 App installation, key custody/rotation, bounded publication authority를 증명할 수 없다. | issues #29 / #227 | Live installation/permissions/key-custody/rotation 및 bounded publication/recovery receipts | 승인된 control-plane preflight에서 source evidence와 분리 보존한다. |
| P0 | Governance enforceability | Required workflow source만으로 실제 approval/deletion/rewrite/break-glass 정책을 모두 증명할 수 없다. | issue #27 | Live ruleset/protection audit와 observed required-workflow behavior | protected mutation 직전 live governance를 다시 읽고 owner control에서만 수정한다. |
| P1 | Durable runtime operation | Source-level durable semantics와 실제 deployed transaction/recovery는 다른 evidence class다. | issue #541 | Deployed Durable Object compatibility + recovery/rollback + immutable release identity | 승인된 runtime evidence가 없으면 ADR 0013 `Proposed`를 유지한다. |
| P1 | Production KPI evidence | Fixture는 reliability, latency, commercial production operation을 입증하지 못한다. | issue #3 | Authenticated retained production KPI window with source/run identity and falsifiable denominator | 승인된 production source가 없으면 fail closed를 유지한다. |
| P1 | Acquisition transfer | Apache-2.0 source grant는 contributor ownership, assignment, artifact-transfer rights 자체를 증명하지 않는다. | issue #5 | Exact-release rights metadata, dependency/NOTICE/SBOM, contributor/IP and transfer evidence | Immutable release 이후 acquisition evidence를 해당 권위에서 수집한다. |

## Completion discipline

각 gap은 Authoritative completion evidence가 실제로 존재하고 current source/head에 결합될 때만 닫는다. 문서 존재, synthetic fixture, model judgement, stale workflow result를 완료 증거로 사용하지 않는다. Release-ready exact protected head가 없으면 version/tag/package/SBOM/provenance/rollback을 제조하지 않는다.