# Noema Product and Technical Gap Baseline

## Authority and update rule

이 문서는 Noema의 protected truth, active candidate, transient workflow evidence, foreign-owner authority를 분리한다. 저장소 문서나 테스트가 특정 revision의 사실을 기록하더라도 predecessor GREEN, queued/skipped/cancelled run, 오래된 PR base snapshot, scanner/model judgement는 다음 revision의 merge authority로 전용하지 않는다. Open PR의 exact head, live base, required workflow, review thread, central dependency는 mutation·merge·release 직전에 다시 조회한다.

현재 protected source는 GitHub-verified protected `main@d6394b2aa73e6fc57fccdad74ea38ad87f79e7f8`다. 이 ancestry에는 merged PR #536 exact `4fe6fe84611dfa1d69d8e0712b72b278429524d0`, merged PR #548 exact `fb44888bd571cae61dbfc93c1b46675855fbfc9c`, merged PR #550 exact `f2ec2dc6709814070cc3e3d6932ce280aee966db`, merged PR #553 exact `3bd9f543e97ce856f78b1c608141436298ce9e74`, merged PR #542 exact `ca839298fcaeec409091dc909789b6f87eb67fdc`의 유효 delta가 포함돼 있다. #542는 durable Workflow / Task Execution과 State / Checkpoint의 atomic claim, checkpoint CAS/replay, effect-start/terminal authority, cancellation/recovery 및 retained-provenance validation을 protected source로 만들었다. ADR 0013은 배포된 Durable Object transaction/runtime 증거가 아직 없으므로 `Proposed`를 유지한다.

Current central control-plane source는 central `.github/main@78a4937c684a54ca8e415822c913742f41c6efc4`다. Noema protected runtime의 reviewed consumer pin은 `c9052e607e5f3cc76e73207e7786b21500721b79`이며 runtime authority 표현은 `ALLOWED_WORKFLOW_SHA = c9052e607e5f3cc76e73207e7786b21500721b79`다. Moving central main과 reviewed immutable consumer source identity를 같은 권위로 취급하지 않는다.

`docs/product-technical-gap-baseline.md`의 cross-lane source writer는 PR #547 하나다. 다른 feature lane이 과거 baseline blob을 포함하더라도 ordinary/non-force semantic convergence 때 current authority로 승계하지 않는다.

## Canonical product boundary

Noema Core Domain은 **Agent Runtime**과 **Workflow / Task Execution**이다. **Tool / Capability Boundary**, **State / Checkpoint**, **Isolation Integration**, **Policy / Approval**, **Observability**, **Recovery**는 명시적 bounded context다. Execution identity, side-effect authority, claim/checkpoint CAS, cancellation/recovery invariant는 Noema transaction boundary에 남긴다.

`contextual-orchestrator`는 provider/model discovery, routing, retry/failover, test-time compute와 provider credential을 소유한다. Noema는 released gateway contract와 canonical `orchestrator/free` alias를 소비할 뿐 direct provider SDK, provider key, provider/model/group fallback policy를 소유하지 않는다. `.github`는 organization reusable workflow와 control-plane source를 소유한다. `quarantine-sandbox-runtime`, Wardnet, EgressWeave, AppGuardrail은 isolation/security/outbound truth를 각자 소유한다. Keyverse는 identity backend owner다. `context-graph-contracts`와 `enterprise-architecture-core`는 released/versioned contract로만 연결하며 mutable sibling PR source, copied domain table, cross-service SQL은 runtime truth가 아니다.

Protected ancestry의 #550은 PR-scoped supersession cancellation과 work-conserving dispatch를, #553은 automation threat-model documentation contract를 통합했다. 이 둘은 active merge lane이 아니라 protected history다. #542는 Durable Object state binding/routing과 durable state-store source를 통합했지만 runtime deployment·compatibility·transaction evidence까지 제조하지 않는다.

## Active candidate convergence — 2026-09-08 KST

### Toolchain / inbound license — issue #531 / PR #540

PR #540 exact `05bc2d47c3899ebe17538070f9a30172f90307ac`는 protected `main@d6394b2...`에 ordinary/non-force semantic convergence를 완료했고 fresh compare는 `behind_by=0`, merge-base는 exact protected main이다. 이 lane은 pinned `workerd@1.20260625.1` + `esbuild@0.28.1`, canonical lockfile regeneration/evidence, lock/license inventory와 patch-validator dependency pruning을 소유한다. Protected #550 workflow-concurrency semantics와 #542 durable runtime source를 덮지 않는다.

Unchanged exact head에서 CI `34155490139`, reviewer-ci `34155490036`, required Security Scan `34155490066`은 terminal success다. `patch-validator-image 34155490034`는 현재 in progress이므로 PR #540은 아직 merge authority가 아니다. Historical image GREEN 또는 predecessor GREEN은 전용하지 않는다.

### Orchestrator/free consumer — PR #535

PR #535 exact `e996b509f699c3f942ef81f0ac52b804b783cd19`는 Draft이며 protected main과 diverged 상태다. Hosted CI `34132537891`은 exact checkout과 package-manager setup 뒤 live pull-request base guard에서 실패했다. 이는 stale-ancestry RED다. 해당 head를 rerun하거나 guard를 약화하지 않고, 당시 live protected main에서 시작해 protected work-conserving/no-model-timeout, #542 durable workflow, `noema-core` Shared Kernel, actionable failed-check/source-evidence behavior를 보존하면서 strict `orchestrator/free`, request-level ZDR/privacy, `timeout=None`, `max_retries=0`, gateway validation과 direct-provider/fallback rejection delta만 ordinary/non-force semantic convergence해야 한다.

### Exact-claim evidence receipts — issue #555 / PR #556

Observed PR #556 exact `fecb03d9c632f90f290f921c1d6e90ce86ca5305`는 live #535가 아닌 과거 feature-base snapshot 위에 있다. `live #556 must be re-fetched before integration`. Hosted CI `34089768682`의 live-base RED와 absent Security evidence 때문에 이 exact head는 non-authorizing이다. #535가 fresh exact-head four-GREEN으로 normally integrate된 뒤에만 protected main과 live #556을 다시 읽고 ordinary/non-force restack/retarget한다.

#556이 소유하는 source contract는 producer-issued evidence receipt, exact repository/head/workflow/run/attempt identity, claim/evidence digest, evidence-kind separation, model-visible `[receipt:<id>]` reference와 pre-publication admission이다. Source receipt는 execution/research authority가 아니다. Remaining boundary는 exact stdout/stderr handoff, trusted research producer, fresh Security 포함 exact-head gates, immutable Noema release, released central `.github#1641` consumer bump와 original corpus RED→GREEN이다.

### Cross-lane baseline — PR #547

PR #547은 이 문서와 executable documentation authority contract의 sole writer다. 이 revision은 stale #535/#542/#550/#553 active-candidate 표현을 제거하고 protected integrations와 현재 open lane을 분리한다. Future #547 commit SHA 자체는 executable contract에 넣지 않는다.

## Current authority table

| Lane | Current authority | Integration condition |
| --- | --- | --- |
| Protected source | protected `main@d6394b2aa73e6fc57fccdad74ea38ad87f79e7f8`; merged #536/#548/#550/#553/#542 | Protected truth. Later candidates preserve these owner deltas. |
| Central workflow trust | central `.github/main@78a4937c684a54ca8e415822c913742f41c6efc4`; reviewed Noema consumer pin `c9052e607e5f3cc76e73207e7786b21500721b79` | Moving central head and immutable reviewed pin stay distinct. |
| Toolchain/license | PR #540 exact `05bc2d47c3899ebe17538070f9a30172f90307ac` | `behind_by=0`; CI/reviewer/Security GREEN, image still in progress; unchanged four-GREEN + clean review before normal merge. |
| Orchestrator/free consumer | PR #535 exact `e996b509f699c3f942ef81f0ac52b804b783cd19` | Live-base RED; semantic convergence onto current protected main before fresh four-GREEN. |
| Exact-claim receipts | observed PR #556 exact `fecb03d9c632f90f290f921c1d6e90ce86ca5305` | Wait for #535 normal integration, then live-read/restack and fresh Security-inclusive evidence. |
| Cross-lane baseline | PR #547 | Sole writer; docs/contracts change together and get wholly fresh exact-head evidence. |

## Evidence semantics and merge rules

A PR can be review-clean while non-authorizing. Review thread resolution, CI, reviewer-ci, required Security Scan, image/SBOM/provenance and branch ancestry are separate evidence classes. Every source mutation or restack invalidates predecessor workflow evidence. `queued`, `pending`, `in_progress`, `skipped`, `cancelled`, stale or absent-required evidence is not passing.

Normal merge requires unchanged exact head, independently refreshed live base/head, no valid unresolved review finding, applicable required terminal-success gates and no foreign-owner/protected-contract regression. Concurrent commits or pushes are not called a race merely because they occur. Wrong base/conflict, stale ADR identity, mutable dependency, missing fixture/contract or single-writer violation is repaired by ordinary/non-force convergence rather than force push, destructive rebase or casual Close.

PR 0은 useful work를 닫아 제조하지 않는다. Open lane은 normal merge 또는 verified successor가 모든 유효 delta/test/fixture/contract/evidence를 완전히 승계한 경우에만 사라진다. Blocked lane은 자기 lane만 막고 unrelated safe review, owner-path repair, docs-to-code repair와 buyer-gap work는 계속한다.

## Buyer and operator gaps

| Priority | Gap | Buyer/operator impact | Current owner | Authoritative completion evidence | Next executable action |
| --- | --- | --- | --- | --- | --- |
| P0 | Toolchain/license convergence | 상용 inbound-policy와 build/development dependency 경계를 구매자가 재현할 수 있어야 한다. | issue #531 / PR #540 | Unchanged exact head의 CI/reviewer/Security/image terminal success, normal integration, protected lock/license evidence | `patch-validator-image 34155490034` terminal result를 확인하고 unchanged head·review·ancestry가 유지되면 정상 병합한다. |
| P0 | Strict orchestrator/free consumer | Noema가 provider/model routing authority를 복제하면 제품 경계와 운영 책임이 흐려진다. | PR #535 | Current protected main 위 semantic convergence + fresh exact-head CI/reviewer/Security/image + normal merge | stale head를 rerun하지 말고 six overlapping protected paths를 semantic union한다. |
| P0 | Exact-claim evidence supply chain | 외부 tool claim이 authenticated producer evidence 없이 reviewer authority로 승격될 수 있다. | issue #555 / PR #556 | #535 merge 후 current-main restack, execution/research producers, immutable release, released central consumer bump, original hosted corpus GREEN | #535 protected integration 전에는 #556을 움직이지 않는다. |
| P0 | Reviewer/Maintainer production identity | Source-only controls로 App installation, key custody/rotation, bounded publication authority를 증명할 수 없다. | issues #29 / #227 | Live installation/permissions/key-custody/rotation 및 bounded publication/recovery receipts | 승인된 control-plane preflight를 실행하고 source evidence와 분리 보존한다. |
| P0 | Governance enforceability | Required workflow source만으로 실제 approval/deletion/rewrite/break-glass 정책을 모두 증명할 수 없다. | issue #27 | Live ruleset/protection audit와 observed required-workflow behavior | protected mutation 직전 live governance를 다시 읽고 owner control에서만 수정한다. |
| P0 | Release/publication evidence | Source merge만으로 immutable artifact provenance, rollback, buyer diligence를 충족하지 못한다. | issue #66 | Version + CHANGELOG + tag + immutable package/release + SBOM + provenance + reproducibility + rollback proof | release-ready protected exact head가 실제 존재할 때만 수행한다. |
| P1 | Production KPI evidence | Fixture는 reliability, latency, commercial production operation을 입증하지 못한다. | issue #3 | Authenticated retained production KPI window with source/run identity and falsifiable denominator | 승인된 production source가 없으면 fail closed를 유지한다. |
| P1 | Acquisition transfer | Apache-2.0 source grant는 contributor ownership, assignment, artifact-transfer rights 자체를 증명하지 않는다. | issue #5 | Exact-release rights metadata, dependency/NOTICE/SBOM, contributor/IP and transfer evidence | immutable release 이후 acquisition evidence를 해당 권위에서 수집한다. |

## Completion discipline

각 gap은 표의 Authoritative completion evidence가 실제로 존재하고 current source/head에 결합될 때만 닫는다. 문서 존재, synthetic fixture, model judgement, stale workflow result를 완료 증거로 사용하지 않는다. Release-ready exact protected head가 없으면 version/tag/package/SBOM/provenance/rollback을 임의로 제조하지 않는다.
