# Noema Product and Technical Gap Baseline

## Authority and update rule

이 문서는 Noema의 protected truth, active candidate, transient workflow evidence, foreign-owner authority를 분리한다. 문서나 테스트가 특정 revision의 사실을 기록하더라도 predecessor GREEN, queued/skipped/cancelled run, 오래된 PR base snapshot, scanner/model judgement는 다음 revision의 merge authority로 전용하지 않는다. Open PR의 exact head, live base, required workflow, review thread, central dependency는 mutation·merge·release 직전에 다시 조회한다.

현재 protected source는 GitHub-verified protected `main@e6de53a1c2902cddc09e77a58efb82420cd8f5db`다. 이 protected ancestry에는 merged PR #536 exact `4fe6fe84611dfa1d69d8e0712b72b278429524d0`의 provider-neutral `packages/noema-core` Shared Kernel/package/reviewer wiring과 merged PR #548 exact `fb44888bd571cae61dbfc93c1b46675855fbfc9c`의 failed-check → actionable-source reviewer evidence repair가 함께 들어 있다. #536 또는 #548의 protected delta를 이후 candidate가 blind overlay로 되돌리면 integration defect로 취급한다.

Current central control-plane source는 central `.github/main@78a4937c684a54ca8e415822c913742f41c6efc4`다. Noema는 central dispatch, provider discovery/routing, security workflow, quarantine 또는 outbound policy 구현을 복제하지 않는다. Noema protected runtime의 reviewed Noema consumer pin `c9052e607e5f3cc76e73207e7786b21500721b79`는 moving central default branch와 다른 immutable source identity다. Runtime authority 표현은 `ALLOWED_WORKFLOW_SHA = c9052e607e5f3cc76e73207e7786b21500721b79`이며, reviewed reusable-workflow source identity가 실제로 바뀐 경우에만 owner-path trust roll-forward를 수행한다.

`docs/product-technical-gap-baseline.md`의 cross-lane source writer는 PR #547 하나다. 다른 feature lane이 과거 baseline blob을 포함하더라도 semantic restack 때 해당 blob을 current authority로 승계하지 않는다. Baseline 수정은 live PR/Issue/branch/workflow 증거를 다시 읽고 executable documentation contract와 함께 갱신한다.

## Protected DDD and canonical ownership

Noema Core Domain은 **Agent Runtime**과 **Workflow / Task Execution**이다. **Tool / Capability Boundary**, **State / Checkpoint**, **Isolation Integration**, **Policy / Approval**, **Observability**, **Recovery**는 명시적 bounded context다. Execution identity, side-effect authority, claim/checkpoint CAS, cancellation/recovery invariants는 Noema transaction boundary에 남긴다.

`contextual-orchestrator`는 model/provider discovery, routing, test-time compute, retry/failover와 provider credential을 소유한다. Noema는 released gateway contract와 canonical `orchestrator/free` alias를 소비할 뿐 direct provider SDK, provider key, provider/model/group fallback policy를 소유하지 않는다. `.github`는 organization reusable workflows와 control-plane source를 소유한다. `quarantine-sandbox-runtime`, Wardnet, EgressWeave, AppGuardrail은 각자의 isolation/security/outbound truth를 소유한다. Keyverse는 identity backend owner다. `context-graph-contracts`와 `enterprise-architecture-core`는 released/versioned contract로만 연결하며 mutable sibling PR source, cross-service SQL, copied domain tables를 runtime truth로 사용하지 않는다.

Protected main의 runtime foundation은 Agent lifecycle, bounded workflow/task admission, state/checkpoint admission, Context Graph release-consumer ACL과 reviewer Shared Kernel을 포함한다. ADR 0012는 repository-wide orchestration decision이 더 넓기 때문에 `Proposed`를 유지한다. 이미 protected인 구현을 Proposed라는 이유로 candidate로 되돌리지 않고, 반대로 open PR을 문서만으로 Accepted 또는 shipped truth로 승격하지 않는다.

## Active candidate convergence — 2026-09-07 KST

### Durable Workflow / Task Execution

issue #541 / #542의 current authority는 PR #542 exact `195fdd70b267332f246d93beb95fa96fabade52e`다. Fresh compare against protected `e6de53...` is ahead-only with `behind_by=0` and merge-base exactly current protected main. 이 lane은 durable execution-plan authority, Durable Object state binding/routing, atomic task claim/checkpoint, effect-start/terminal authority, cancellation/recovery, retained provenance와 hostile stored-record validation을 소유한다. Current effective delta는 protected Shared Kernel이나 reviewer evidence를 덮지 않는다. Latest observation에서는 CI와 image가 non-terminal이고 reviewer/Security가 queued이므로 merge authority가 아니다.

### Workflow concurrency and work-conserving dispatch

PR #550 exact `f2ec2dc6709814070cc3e3d6932ce280aee966db`도 protected `e6de53...`에 ordinary/non-force semantic convergence를 완료했고 fresh compare는 `behind_by=0`이다. Protected #536 reviewer-ci/package wiring을 보존한 상태에서 PR-scoped supersession cancellation, work-conserving hourly-product-development dispatch, current workflow test contract만 overlay한다. #540은 이 lane이 정상 통합되기 전에는 오래된 workflow copies를 protected main 위에 올리지 않는다. Current exact-head gates는 아직 terminal four-GREEN이 아니다.

### Automation threat model

PR #553 exact `c03d946f52faf65b1f9b75c3c601fed106ffcbd0`는 protected `e6de53...`에 ordinary/non-force semantic convergence를 완료했고 `behind_by=0`이다. Effective delta는 automation threat-model documentation과 architecture contract test에 한정된다. Exact-head required gates가 모두 terminal success가 되기 전에는 merge하지 않는다.

### Orchestrator/free consumer

PR #535 exact `59205b5ae333a1f2b5e6b2112bf059592ba492c9`는 #536 직후에는 current-main convergence를 완료했지만 #548 정상 통합 이후 다시 diverged 상태다. Fresh compare against `e6de53...`의 merge-base는 이전 protected `4c1d174...`이고, #548이 `agent.py`, `gating.py`, `models.py`와 reviewer tests 등 이 lane과 겹치는 failed-check/source-evidence 경계를 protected truth로 만들었다. 따라서 이전 four-gate generation을 merge authority로 쓰지 않는다.

최소 causal repair는 #548의 actionable failed-check/source-evidence semantics와 #536 Shared Kernel/package boundary를 보존한 ordinary/non-force semantic convergence다. 그 위에 #535가 소유하는 `orchestrator/free`, ZDR/privacy, `timeout=None`, `max_retries=0`, HTTPS/loopback gateway validation, stale service-alias fail-closed, direct-provider/fallback rejection만 합성해야 한다. Provider discovery/routing/retry/failover는 contextual-orchestrator에 남긴다.

### Exact-claim evidence receipts

이 문서 revision의 moving-stack observation은 observed PR #556 exact `fecb03d9c632f90f290f921c1d6e90ce86ca5305`다. live #556 must be re-fetched before integration. #556은 #535 feature-base의 오래된 snapshot 위에 있어 hosted CI run `34089768682` / job `101640717018`에서 exact checkout과 toolchain setup 뒤 live-base guard가 RED가 됐다. Head가 당시 live #535 base를 포함하지 않았기 때문이다. Reviewer/image predecessor success는 이 ancestry defect를 덮지 못하고 future restack으로 transfer되지 않는다.

Issue #555 / PR #556이 소유하는 source contract는 producer-issued evidence receipt, exact repository/head/workflow/run/attempt identity, claim digest, evidence artifact digest/size, evidence-kind separation, model-visible `[receipt:<id>]` reference, pre-publication authenticated manifest admission이다. Source receipt는 execution/research authority가 아니고, execution adapter는 reviewed helper identity와 independently captured stdout/stderr bytes를 요구한다. 남은 경계는 #535 protected integration 뒤 current-main restack/retarget, released consumer의 execution byte handoff, trusted research producer, required Security를 포함한 fresh exact-head gates, immutable Noema release, released central `.github#1641` consumer bump와 original hosted corpus RED→GREEN이다. #556의 역사적 baseline-file delta는 #547 sole-writer 규칙 때문에 eventual restack에서 승계하지 않는다.

### Toolchain / inbound license

issue #531 / #540의 current source head는 PR #540 exact `2eba9d6b1e3365f745dd43bb8e40e87b0f2ead3a`다. 이 lane은 pinned `workerd@1.20260625.1` + `esbuild@0.28.1`, lockfile/license inventory와 Cloudflare toolchain replacement를 소유하지만 #550의 current CI/image concurrency semantics와 겹친다. #550 normal integration 후 당시 protected CHANGELOG/workflows를 보존하는 ordinary/non-force semantic convergence를 수행해야 한다. 이전 exact-head GREEN은 current ancestry의 package/license proof가 아니다.

## Current authority table

| Lane | Current authority | Integration condition |
| --- | --- | --- |
| Protected source | protected `main@e6de53a1c2902cddc09e77a58efb82420cd8f5db`; merged PR #536 exact `4fe6fe84611dfa1d69d8e0712b72b278429524d0`; merged PR #548 exact `fb44888bd571cae61dbfc93c1b46675855fbfc9c` | Protected truth. Later candidates preserve Shared Kernel/package and reviewer failed-check/source-evidence semantics. |
| Central workflow trust | central `.github/main@78a4937c684a54ca8e415822c913742f41c6efc4`; reviewed Noema consumer pin `c9052e607e5f3cc76e73207e7786b21500721b79` | Moving control-plane head and immutable reviewed consumer source pin remain distinct. |
| Durable workflow | PR #542 exact `195fdd70b267332f246d93beb95fa96fabade52e` | `behind_by=0`; unchanged exact-head CI/reviewer/Security/image + clean review + normal merge. |
| Workflow concurrency | PR #550 exact `f2ec2dc6709814070cc3e3d6932ce280aee966db` | `behind_by=0`; preserve Protected #536 reviewer-ci/package wiring; four-GREEN before normal merge. |
| Threat model | PR #553 exact `c03d946f52faf65b1f9b75c3c601fed106ffcbd0` | `behind_by=0`; documentation/contract delta only; four-GREEN before normal merge. |
| Orchestrator/free consumer | PR #535 exact `59205b5ae333a1f2b5e6b2112bf059592ba492c9` | Post-#548 semantic convergence required before fresh gates can authorize merge. |
| Exact-claim receipts | observed PR #556 exact `fecb03d9c632f90f290f921c1d6e90ce86ca5305` | Hosted live-base RED; wait for #535 integration, then live-read/restack; research/execution handoff + release + central consumer GREEN remain. |
| Toolchain/license | PR #540 exact `2eba9d6b1e3365f745dd43bb8e40e87b0f2ead3a` | Wait for #550 integration, then semantic restack preserving current workflows and lock/license delta. |
| Cross-lane baseline | PR #547 | Sole writer. Tests and baseline change together; moving exact heads remain observation-scoped. |

## Evidence semantics and review/merge rules

A PR can be review-clean while non-authorizing. Review thread resolution, CI, reviewer-ci, required Security Scan, image/SBOM/provenance and branch ancestry are separate evidence classes. Every source mutation or restack invalidates predecessor workflow evidence. `queued`, `pending`, `in_progress`, `skipped`, `cancelled`, stale or absent-required evidence is not passing. Feature-base stacks that are outside the default-branch required-workflow condition do not get synthetic GREEN from an absent Security run; once retargeted to protected main they require the fresh scanner generation dictated by live rules.

Normal merge requires the unchanged exact head, independently refreshed live base/head, no valid unresolved review finding, applicable required terminal-success gates, and no foreign-owner or protected-contract regression. Concurrent commits/pushes are not called a race merely because they occur. Wrong base/conflict, stale ADR identity, mutable dependency, missing fixture/contract or single-writer violation is repaired by ordinary/non-force convergence rather than force push, destructive rebase or casual Close.

PR 0 is never manufactured by closing useful work. An open lane disappears only by normal merge or verified successor inheritance of every valid delta/test/fixture/contract/evidence. A blocked lane blocks only itself; unrelated safe review, owner-path repair, docs-to-code repair and buyer-gap work continues.

## Buyer and operator gaps

| Priority | Gap | Buyer/operator impact | Current owner | Completion evidence | Next executable action |
| --- | --- | --- | --- | --- | --- |
| P0 | Durable execution authority | Duplicate side effects, checkpoint divergence or recovery ambiguity directly undermine an agent-runtime sale. | issue #541 / #542 | Protected integration of atomic claim/checkpoint/effect/cancellation/recovery invariants plus exact-head gates and runtime evidence | Continue exact-head verification of PR #542 exact `195fdd70b267332f246d93beb95fa96fabade52e`; merge only on unchanged four-GREEN and clean review. |
| P0 | Reviewer semantic convergence | Blindly restoring pre-#548 reviewer files would regress actionable failed-check/source evidence. | #535 → #556 | #535 post-#548 semantic convergence, exact-head gates, protected merge; then #556 current-main restack | Rebuild #535 on protected `e6de53...` preserving #548 and #536 truth before any #556 movement. |
| P0 | Exact-claim evidence supply chain | A model-authored external-tool claim without producer-authenticated evidence can create false review authority. | issue #555 / PR #556 → `.github#1641` | Authenticated claim receipts + execution/research producers + immutable release + released consumer bump + original hosted corpus GREEN | Preserve current consumer RED; repair only after #535 integration and #556 current-main convergence. |
| P0 | Workflow/toolchain convergence | An old #540 workflow copy can erase work-conserving/supersession semantics or hide inbound-license proof. | #550 → issue #531 / #540 | #550 protected merge, then #540 semantic restack with pinned toolchain, lock/license and current workflow tests | Finish #550 exact-head gates first; restack #540 only after protected movement. |
| P0 | Reviewer/Maintainer production identity | Source-only controls cannot prove App installation, key custody, rotation or bounded publication authority. | issues #29 / #227 | Live installation/permissions/key custody/rotation and bounded publication/recovery receipts | Execute authorized control-plane preflight; do not synthesize evidence from source. |
| P0 | Governance enforceability | Required workflows alone do not prove all approval, deletion, rewrite and break-glass controls. | issue #27 / organization control plane | Live ruleset/protection audit and observed required-workflow behavior | Re-read live governance before every protected mutation; foreign governance remains read-only from Noema. |
| P0 | Release/publication evidence | Source merge without immutable artifact provenance leaves buyer rollback and supply-chain diligence incomplete. | issue #66 | Version + CHANGELOG + tag + immutable package/release + SBOM + provenance + reproducibility + rollback proof from one protected exact head | Perform only when a release-ready protected head actually exists. |
| P1 | Production KPI evidence | Repository fixtures cannot establish reliability, latency or commercial production operation. | issue #3 | Authenticated retained production KPI window with source/run identity and falsifiable denominator | Keep synthetic/unit evidence separate; do not claim production readiness from CI. |
| P1 | Acquisition transfer | Apache-2.0 source grant does not prove contributor ownership, assignment or artifact-transfer rights. | issue #5 | Exact-release rights metadata, dependency/NOTICE inventory, contributor/IP evidence and owner/legal disposition | Maintain fail-closed transfer state until external evidence exists. |

## Performance, security and quality gates

Noema-owned production code targets 100% statement/branch coverage and public docstring/rustdoc coverage where applicable. Security-sensitive behavior is fail closed and uses realistic malformed/duplicate/stale/cross-identity fixtures rather than broad exclusions. Runtime/web buyer paths use async composition and current-head E2E/k6 evidence where they are meaningful; a p95 target is not claimed met until the real path is measured without sample truncation or artificial warm-cache exclusions.

Noema does not own a general relational domain store. If persistence expands, transaction boundaries follow the owning aggregate and avoid cross-service SQL. Capability, checkpoint and event evidence retain canonical identity, version, provenance, valid/system time where the released contract defines them; foreign product records stay references, not copied truth. Purpose-bound PII and audit retention must be explicit before production collection.

Material UI work is not implied by the current backend/runtime lanes. If a Noema product surface becomes material, its reusable components, design tokens/Figma IDs, normal/loading/empty/error/permission states, keyboard/a11y behavior, responsive layouts and KO/EN/JA/ZH/VI/ES/DE/FR text expansion become release evidence rather than decorative completion claims.

## Release gate

A release-ready exact protected head must complete versioning, CHANGELOG, immutable tag/package/release, SBOM, provenance/attestation, reproducibility and rollback evidence as one traceable chain. Source CI, scanner success or a merge alone cannot substitute for that chain. Noema currently has no basis in this document to manufacture a release from an open Draft head.

The integration loop therefore remains: fresh live state → review/valid finding → realistic RED where a defect exists → minimum causal repair → unchanged exact-head GREEN → normal merge → ordinary/non-force dependent convergence → next buyer gap. Every execution ends with two fresh protected/central/open-PR/release sweeps; a changed identity reopens the affected decision rather than being silently normalized.