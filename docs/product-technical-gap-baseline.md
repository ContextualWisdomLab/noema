# Noema Product and Technical Gap Baseline

## Authority and update rule

이 문서는 protected source, active candidate, transient workflow evidence와 foreign-owner authority를 분리한다. Open PR exact head, protected base, required workflow, review thread, release와 central dependency는 mutation·merge·release 직전에 다시 읽는다. predecessor GREEN, queued/pending/in-progress/skipped/cancelled run, 오래된 PR base snapshot과 scanner/model judgement는 다음 revision의 merge authority로 전용하지 않는다.

Current protected source는 GitHub-verified protected `main@59ae66de96b64c8ce51f0030a624815a08dbefdd`다. 이 protected revision에는 normal #558 merge와 merged PR #558 exact `2f91bf8641212ecae435b5fbcc9084cc0acd6295`의 patch-validator default-branch cache-seed contract가 포함돼 있다. Current source SHA는 moving observation이며 future merge 뒤 evergreen identity로 취급하지 않는다.

이 revision 작성 시 moving central control-plane snapshot은 central `.github/main@78a4937c684a54ca8e415822c913742f41c6efc4`다. Noema runtime의 reviewed immutable central consumer pin은 `c9052e607e5f3cc76e73207e7786b21500721b79`이고 runtime authority 표현은 `ALLOWED_WORKFLOW_SHA = c9052e607e5f3cc76e73207e7786b21500721b79`다. Moving foreign head와 reviewed immutable pin을 같은 권위로 취급하지 않는다.

Merged documentation history에는 merged PR #547 exact `30b7e7e5cdab8de65715834a16f994b2047eafa6`가 있고, toolchain history에는 merged PR #540 exact `05bc2d47c3899ebe17538070f9a30172f90307ac`, durable workflow/state history에는 merged PR #542 exact `ca839298fcaeec409091dc909789b6f87eb67fdc`, work-conserving concurrency에는 merged PR #550 exact `f2ec2dc6709814070cc3e3d6932ce280aee966db`, automation threat-model documentation에는 merged PR #553 exact `3bd9f543e97ce856f78b1c608141436298ce9e74`가 포함돼 있다. 이 SHA들은 protected lineage의 역사 증거이며 open-candidate authority가 아니다.

#559가 cross-lane commercial baseline과 executable documentation-authority tests를 소유한다. 다른 feature lane에 포함된 과거 baseline blob은 ordinary/non-force convergence 때 current authority로 승계하지 않는다.

## Canonical product boundary

Noema Core Domain은 **Agent Runtime**과 **Workflow / Task Execution**이다. **Tool / Capability Boundary**, **State / Checkpoint**, **Isolation Integration**, **Policy / Approval**, **Observability**, **Recovery**는 명시적 bounded context다. Execution identity, side-effect authority, claim/checkpoint CAS, cancellation/recovery invariant는 Noema transaction boundary에 남긴다.

`contextual-orchestrator`는 provider/model discovery, routing, retry/failover, test-time compute와 provider credential을 소유한다. Noema는 released gateway contract와 canonical `orchestrator/free` alias를 소비할 뿐 direct provider SDK, provider key, provider/model/group fallback policy를 소유하지 않는다. `.github`는 organization reusable workflow와 control-plane source를 소유한다. `quarantine-sandbox-runtime`, Wardnet, EgressWeave, AppGuardrail은 isolation/security/outbound truth를 각자 소유한다. Keyverse는 identity backend owner다. `context-graph-contracts`와 `enterprise-architecture-core`는 released/versioned contract로만 연결하고 mutable sibling PR source, copied domain table, cross-service SQL을 runtime truth로 사용하지 않는다.

#550은 PR-scoped supersession cancellation과 work-conserving dispatch를 protected source에 통합했다. #542는 Durable Workflow / Task Execution과 State / Checkpoint의 atomic task claim, checkpoint CAS/replay, effect-start/terminal authority, cancellation/recovery 및 retained-provenance validation을 protected source로 만들었다. ADR 0013은 deployed Durable Object transaction/runtime evidence가 없으므로 `Proposed`를 유지한다. #540은 historical Wrangler/Miniflare/Sharp/Libvips tooling path를 제거하고 pinned `workerd@1.20260625.1` + `esbuild@0.28.1`, canonical lock/license evidence와 patch-validator dependency pruning을 protected source에 통합했다.

## Active candidate convergence — 2026-09-08 KST

### Orchestrator/free consumer — PR #535

PR #535 exact `551d81da28b0c03ca44deedf60e95125dcceb81b`는 Draft다. #558 integration 뒤 branch를 force 없이 ordinary two-parent convergence했고, first parent는 current protected source, second parent는 predecessor `06ed62fcc5611e9b25ef38b06e87e7521dbf1be1`다. Fresh compare는 ahead-only, `behind_by=0`, merge-base exact current protected main이다.

Semantic convergence는 protected #558의 `.github/workflows/patch-validator-image.yml`, `test/patch-validator-image-build-cache.test.ts`, `test/patch-validator-workflow.test.ts`를 보호해 retired FaaS parity build path를 되살리지 않는다. #535의 strict `orchestrator/free`, request-level ZDR/privacy, reviewer `timeout=None`, `max_retries=0`, gateway validation, direct-provider/fallback rejection과 OpenCode tool-capability boundary는 유지한다. Provider/model discovery·routing·credential·retry/failover truth는 contextual-orchestrator owner에 남긴다.

이 exact head의 새 generation은 application CI `34181022232`, reviewer-ci `34181022241`, required Security Scan `34181022210`, patch-validator-image `34181022238`이며 현재 queued 상태다. 이전 exact head의 GREEN은 transfer하지 않는다. Next action은 unchanged exact head에서 terminal four-GREEN, fresh clean review authority, unchanged protected ancestry를 다시 확인한 뒤 normal merge하는 것이다.

### Patch-validator default-branch cache seed — merged #558 / issue #66

Merged PR #558 exact `2f91bf8641212ecae435b5fbcc9084cc0acd6295`는 protected source에 포함됐다. Protected workflow는 image-authority path가 protected main에서 바뀔 때 full image verification을 실행해 default-branch BuildKit cache seed를 만들 수 있게 하며, `workflow_dispatch`, PR-scoped cancellation, stale-head refusal, pinned scanner/toolchain, static runtime checks, no-network/non-root smoke, SBOM/vulnerability receipts와 fail-closed verification을 유지한다.

Source integration 자체는 protected-main push run의 cache hit, immutable image digest publication, signature/attestation, reproducibility 또는 rollback을 자동으로 증명하지 않는다. Issue #66은 실제 protected-main operational evidence와 immutable publication evidence가 생길 때까지 open authority다.

### Exact-claim evidence receipts — issue #555 / PR #556

Observed PR #556 exact `9d6d52c1dd4fc88203a832b509f4ec28cef3c68a`는 Draft다. `live #556 must be re-fetched before integration`. 이 candidate는 legitimate ordinary descendant이지만 predecessor #535 source 위에서 구성됐고, current #535와의 fresh compare는 diverged다. 따라서 current #556 gate 결과를 post-#535 integration authority로 사용하지 않는다.

#556의 retained contract는 authenticated producer receipt와 `ClaimEvidenceRequirement` publication authority를 분리한다. Raw current-head source receipt는 context authority일 뿐이고, trusted producer가 exact claim/evidence kind와 finding coordinates를 명시적으로 승인하지 않는 한 blocking finding을 권위화하지 못한다. Requirement/receipt mismatch, wrong coordinates, direct model dictionaries, context-to-finding promotion은 deterministic gate와 publisher 전에 fail closed한다.

#535가 normally integrate된 뒤 resulting protected main과 live #556을 다시 읽고, valid claim-evidence implementation/tests만 ordinary/non-force restack/retarget한다. #559 소유 baseline의 historical blob은 제외하고 `central-review.yml` 등 #535 overlap은 protected semantics와 합성한다. 이후 fresh Security-inclusive exact-head gates와 normal merge가 필요하다.

Remaining supply-chain boundary는 exact stdout/stderr handoff, trusted research producer, immutable Noema release, released central `.github#1641` consumer bump와 unchanged original corpus RED→GREEN이다.

## Protected but incomplete commercial evidence

### Toolchain and inbound rights — issue #531 / merged #540

Source remediation은 protected lineage에 있다. 남은 권위는 exact released package/image/SBOM/provenance/reproducibility, NOTICE/attribution, actual artifact rights와 explicit owner/legal outbound-rights evidence다. Source-only license inventory를 release evidence로 승격하지 않는다.

### Durable runtime operation — issue #541 / merged #542

Durable workflow/state source는 protected lineage에 있다. 남은 권위는 deployed Durable Object binding/transaction compatibility, recovery/rollback receipt, immutable release/package/SBOM/provenance/reproducibility다. 이 evidence 전까지 ADR 0013은 `Proposed`다.

### Governance and production identity

Required workflow source만으로 reviewer/maintainer App installation, key custody/rotation, bounded publication authority, ruleset enforcement, break-glass operation을 모두 입증할 수 없다. Live governance와 approved control-plane evidence는 source evidence와 별도로 유지한다.

## Current authority table

| Lane | Authority | Integration / completion condition |
| --- | --- | --- |
| Protected source | live protected main; current observation protected `main@59ae66de96b64c8ce51f0030a624815a08dbefdd` | mutation·merge·release 직전 exact protected head 재조회 |
| Central workflow trust | central `.github/main@78a4937c684a54ca8e415822c913742f41c6efc4`; reviewed pin `c9052e607e5f3cc76e73207e7786b21500721b79` | moving head와 immutable reviewed pin 분리 |
| Toolchain/license source | merged PR #540 exact `05bc2d47c3899ebe17538070f9a30172f90307ac` | source complete; release/publication/rights evidence 미완료 |
| Durable workflow/state source | merged PR #542 exact `ca839298fcaeec409091dc909789b6f87eb67fdc` | source complete; deployed runtime/recovery/release evidence 미완료 |
| Documentation authority | merged PR #547 exact `30b7e7e5cdab8de65715834a16f994b2047eafa6` + active #559 successor | moving PR/protected truth를 #559에서 code-current 유지 |
| Orchestrator/free consumer | PR #535 exact `551d81da28b0c03ca44deedf60e95125dcceb81b` | fresh four-GREEN + clean review + current ancestry 후 normal merge |
| Patch-validator cache seed | merged PR #558 exact `2f91bf8641212ecae435b5fbcc9084cc0acd6295` | protected operational run/cache behavior + immutable image/release evidence |
| Exact-claim receipts | observed PR #556 exact `9d6d52c1dd4fc88203a832b509f4ec28cef3c68a` | #535 merge 후 protected-source restack, fresh Security-inclusive gates, immutable release |

## Evidence semantics and merge rules

A PR can be review-clean while non-authorizing. Review thread resolution, CI, reviewer-ci, required Security Scan, image/SBOM/provenance and branch ancestry are separate evidence classes. Every source mutation or restack invalidates predecessor workflow evidence. `queued`, `pending`, `in_progress`, `skipped`, `cancelled`, stale or absent-required evidence is not passing.

Normal merge requires unchanged exact head, independently refreshed live base/head, no valid unresolved review finding, applicable required terminal-success gates and no foreign-owner/protected-contract regression. Concurrent commits or pushes are not called a race merely because they occur. Wrong base/conflict, stale ADR identity, mutable dependency, missing fixture/contract or single-writer violation is repaired by ordinary/non-force semantic convergence rather than force push, destructive rebase or casual Close.

PR 0은 useful work를 닫아 제조하지 않는다. Open lane은 normal merge 또는 verified successor가 모든 유효 delta/test/fixture/contract/evidence를 완전히 승계한 경우에만 사라진다. Blocked lane은 자기 lane만 막고 unrelated safe review, owner-path repair, docs-to-code repair와 buyer-gap work는 계속한다.

## Buyer and operator gaps

| Priority | Gap | Buyer/operator impact | Current owner | Authoritative completion evidence | Next executable action |
| --- | --- | --- | --- | --- | --- |
| P0 | Strict orchestrator/free consumer | Noema가 provider/model routing authority를 복제하면 제품 경계와 운영 책임이 흐려진다. | PR #535 | fresh exact-head CI/reviewer/Security/image + normal merge | current exact generation 실패 시 causal repair; GREEN이면 current-base/review 재검증 후 normal merge |
| P0 | Exact-claim evidence supply chain | Tool/research claim이 producer evidence 없이 reviewer authority로 승격될 수 있다. | issue #555 / PR #556 | #535 merge 후 restack, execution/research producer evidence, normal merge, immutable release, released consumer RED→GREEN | #535 normal integration 후 live #556을 재구성 |
| P0 | Patch-validator operational publication | source merge만으로 reusable cache와 immutable runtime activation을 증명할 수 없다. | issue #66 | protected-main image/cache receipt + immutable image/signature/SBOM/provenance/reproducibility/rollback | protected operational evidence를 exact source에 결합 |
| P0 | Toolchain/license release evidence | source dependency remediation만으로 실제 배포 artifact 권리와 재현성을 증명할 수 없다. | issue #531 | protected exact release package/image/SBOM/provenance/reproducibility/NOTICE/rights | release-ready protected exact head에서만 publication evidence 생성 |
| P0 | Reviewer/Maintainer production identity | source control만으로 App installation, key custody/rotation, bounded publication authority를 증명할 수 없다. | issues #29 / #227 | live installation/permissions/key-custody/rotation + bounded publication/recovery receipt | approved control-plane evidence와 source evidence를 분리 보존 |
| P0 | Governance enforceability | workflow source만으로 approval/deletion/rewrite/break-glass 정책 전체를 증명할 수 없다. | issue #27 | live ruleset/protection audit + observed required-workflow behavior | protected mutation 직전 governance 재조회 |
| P1 | Durable runtime operation | source-level durable semantics와 deployed transaction/recovery는 별도 evidence class다. | issue #541 | deployed compatibility + recovery/rollback + immutable release identity | evidence 전 ADR 0013 `Proposed` 유지 |
| P1 | Production KPI evidence | fixture는 reliability, latency, commercial operation을 입증하지 못한다. | issue #3 | authenticated retained production KPI window with source/run identity and denominator | approved production source가 없으면 fail closed 유지 |
| P1 | Acquisition transfer | Apache-2.0 source grant는 contributor ownership, assignment, artifact-transfer rights 자체를 증명하지 않는다. | issue #5 | exact-release rights metadata, dependency/NOTICE/SBOM, contributor/IP and transfer evidence | immutable release 이후 acquisition evidence 수집 |

## Completion discipline

각 gap은 Authoritative completion evidence가 실제로 존재하고 current source/head에 결합될 때만 닫는다. 문서 존재, synthetic fixture, model judgement, stale workflow result를 완료 증거로 사용하지 않는다. Release-ready exact protected head가 없으면 version/tag/package/SBOM/provenance/rollback을 제조하지 않는다.