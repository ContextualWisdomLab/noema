# Noema Product and Technical Gap Baseline

## Authority and update rule

이 문서는 Noema의 protected truth, active candidate, transient workflow evidence, foreign-owner authority를 분리해 추적한다. 저장소 문서와 테스트는 해당 revision의 source contract만 증명하며, predecessor GREEN·queued/skipped/cancelled run·문서 존재·model judgement를 다음 단계의 권위로 전용하지 않는다. PR은 live protected base와 unchanged exact head에서 다시 검증하고, 외부 제품의 domain truth·LLM provider routing·quarantine/security·outbound authority는 Noema source로 복제하지 않는다.

현재 protected-source snapshot은 `main@e26d771470a4ece873c367b40b3cd6cb03ac7de3`다. 이 revision은 protected #546 semantic reviewer, #544 immutable Context Graph consumer admission, #533 runner-assignment semantic evidence, #552 cross-session coordination guidance와 #527 OIDC trust roll-forward를 포함한다. #527은 exact `d289bfcdb617249c90f9fcc1ba050a59334d07fd`에서 application CI, reviewer-ci, required Security Scan, patch-validator-image가 모두 terminal success이고 current unresolved review thread가 0인 상태에서 정상 merge되어 protected `e26d771...`가 됐다.

## Live observation — 2026-09-06 KST

| Authority | Exact observation | Consequence |
| --- | --- | --- |
| Protected Noema | `main@e26d771470a4ece873c367b40b3cd6cb03ac7de3` | Agent Runtime/Workflow foundation, semantic reviewer, Context Graph release-consumer admission, runner-assignment evidence, cross-session coordination과 current central-workflow OIDC pin이 protected truth다. |
| Central workflow owner | `.github/main@43024633eba9d96b0456970391360da5a171fbda` | Central #1953은 Strix sandbox-bootstrap retry/verdict owner repair다. Noema가 그 retry/provider/security 구현을 복제하지 않는다. Current protected Noema OIDC trust는 이 complete central source commit에 exact equality로 결합돼 있다. |
| Shared Kernel candidate | PR #536 exact `a1172fc2d50ae28b2e67c1696ce0578c16c5a6d9` | `noema-core`는 이미 해석된 PydanticAI `Model`을 받아 provider-neutral `Agent(..., retries=0)`만 구성한다. Provider discovery/credential/routing/retry/failover는 contextual-orchestrator authority다. #527 merge 이후 current protected ancestry를 다시 포함해야 한다. |
| Workflow-concurrency candidate | PR #550 exact `12f8e3d9e74776156c9f70d29a5ef0ae0d25a96c` | PR supersession만 cancel하고 push/manual run identity를 보존하는 Noema repository-local concurrency delta다. #527 merge 이후 current protected ancestry에서 fresh exact-head evidence가 필요하다. |
| Reviewer evidence candidate | PR #548 exact `75f93fd5d16f3b56eafd0f12a0eabe14ee277766` | Failed-check evidence를 current-head source finding에 결합하고 `Finding.line`을 exact positive integer/None으로 제한한다. #527 merge 이후 predecessor evidence는 전용하지 않는다. |
| Small active candidates | #539 `bb2f3b8bc734dc3926f2a0ac6b0265fae91040b3`; #543 `a6970ca89ee589368799b8c4b0656dec7b87c2a8`; #553 `722fa1202a51cc774cc71af1c0a0e34429c81bdd` | 각각 canonical temp-root fixture, required-gate suppression 금지 regression, automation threat-model correction이다. Current protected main 이동 뒤 non-force convergence와 fresh gates가 필요하다. |
| Orchestrator/free lane | PR #535 exact `99e44d0d4e0ae564f582a6d4587d35db449598aa` | Branch-owned reviewer/config/privacy/tool boundary는 `orchestrator/free` consumer contract만 가진다. CO가 provider/model discovery, routing, retry/failover와 credentials를 계속 소유한다. Current protected main 이동 뒤 non-force convergence가 필요하다. |
| Toolchain/license lane | PR #540 exact `591795afbc79128a48e814cdfa7869c8b9785082` | `workerd@1.20260625.1` + `esbuild@0.28.1` candidate와 exact-base lockfile policy를 소유한다. `baseSha`는 새 protected base에서 다시 검증·rebind해야 하며 이전 generation의 GREEN은 전용하지 않는다. |
| Durable Workflow / Task Execution | issue #541 / PR #542 exact `93bfa5e528f0fb91bcd7ac41a8c2e870a4c06f56` | Atomic claim, effect-start evidence, checkpoint CAS, recovery/cancellation, operation-stable payload minimization, nested projection, missing-state/storage-outage/unexpected-fault fail-closed contract는 Noema-owned candidate다. Current protected ancestry에서 다시 검증해야 한다. |
| Acquisition evidence | PR #526 exact `21ead9fd25df3a7e585ce0cef66221d69e4ae9cf` | `{path, sha256}` retained-source authority와 protected distributable `package_metadata.sha256` 계약을 합성한 lane이다. SHA-256은 byte identity만 증명하며 buyer/legal truth를 만들지 않는다. Current protected main 이동 뒤 fresh evidence가 필요하다. |
| Documentation authority | PR #547 | 이 문서 lane은 protected `e26d771...`, central owner movement와 active PR heads를 결합하는 전용 writer다. Hosted CI의 exact-string RED도 이 lane에서 causal repair하고 current main을 non-force로 restack한다. |
| Release/publication | fresh release authority는 종료 sweep에서 별도 확인한다 | Source/CI readiness를 version/tag/package/image/SBOM/provenance/reproducibility/rollback을 갖춘 immutable release로 자동 승격하지 않는다. |

## DDD and ownership baseline

Noema의 Core Domain은 **Agent Runtime**과 **Workflow / Task Execution**이다. **Tool / Capability Boundary**, **State / Checkpoint**, **Isolation Integration**, **Policy / Approval**, **Observability**, **Recovery**는 명시적 bounded context로 유지한다. Aggregate와 invariant는 최소 transaction boundary에서 유지하고 side-effect authority, execution identity, claim/checkpoint CAS를 foreign domain truth와 혼합하지 않는다.

Context Map의 외부 관계는 versioned contract/ACL consumer가 기본이다. `contextual-orchestrator`는 LLM provider/model discovery, routing, test-time compute, retry/failover와 provider credentials를 소유한다. `.github`는 reusable workflow와 organization control-plane source를 소유한다. `quarantine-sandbox-runtime`, Wardnet, EgressWeave/AppGuardrail 계열은 각자의 isolation/security/outbound truth를 소유한다. Keyverse는 identity backend owner다. `context-graph-contracts`와 Enterprise Architecture 계열은 released/versioned contract만 소비하며 mutable sibling PR head, source copy, cross-service SQL을 runtime truth로 사용하지 않는다.

ADR 0012는 broader runtime-orchestration decision이 아직 넓기 때문에 `Proposed`를 유지한다. 이미 protected인 runtime/context-consumer slice를 Proposed라는 이유로 candidate로 되돌리지 않으며, 아직 candidate인 durable workflow state를 문서만으로 Accepted 처리하지 않는다.

## Durable workflow acceptance baseline

PR #542의 private `NOEMA_WORKFLOW_STATE` boundary는 Noema의 Workflow / Task Execution + State / Checkpoint authority만 운반한다. Arbitrary caller structural object 전체를 wire authority로 취급하지 않는다. Operation discriminator는 한 번 snapshot되고 operation별 allowlist가 top-level payload를 제한하며, nested claim/checkpoint도 canonical fields만 projection한다. Malformed non-record input은 거짓-valid object로 정규화하지 않고 Durable Object validation에 남긴다.

Hosted evidence는 retained-plan/missing-state, storage outage `503 storage_unavailable`, unexpected repository/runtime fault `500 internal_error`까지 분리해 fail closed하도록 진전했다. 이 candidate가 protected truth가 되려면 current protected ancestry, unchanged exact-head application/reviewer/Security/image와 100% owned production coverage/docstring/edge gates, zero valid unresolved findings가 다시 필요하다.

## Commercial and buyer gaps

| Priority | Gap | Buyer/operator impact | Canonical owner / lane | Completion evidence |
| --- | --- | --- | --- | --- |
| P0 | Current-main convergence | #527 merge 뒤 유효 delta가 stale ancestry에 남으면 exact-head evidence와 merge authority가 갈라진다. | affected open PRs | ordinary/non-force semantic restack, current merge-base, unchanged exact-head terminal gates, zero valid findings |
| P0 | Atomic durable workflow authority | duplicate claim/effect, ambiguous recovery 또는 over-broad state transport가 long-running execution을 훼손한다. | issue #541 / #542 | single-winner claim, checkpoint CAS, recovery/cancellation/effect evidence, payload minimization, fail-closed fault classes, exact-head GREEN, protected merge |
| P0 | GPL-family development/build path | procurement·redistribution·clean-SBOM acceptance를 막는다. | issue #531 / #540 | current-base lock policy, regenerated deterministic lockfile, dependency/license/security/image/SBOM/provenance gates, protected merge |
| P0 | Reviewer/Maintainer production identity | independent least-authority review/publication을 운영 증거로 입증할 수 없다. | issues #29 / #227 | live installation/permissions/key custody/rotation과 bounded publication/recovery receipts |
| P0 | Governance enforceability | source test만으로 required review/history/rewrite/deletion 통제를 입증할 수 없다. | issue #27 / organization control plane | live ruleset/protection evidence와 required workflow behavior |
| P1 | Patch-validator publication | source image가 실제 immutable publication/signing/activation됐는지 구매자가 확인할 수 없다. | issue #66 | protected-source registry digest, signature/attestation, operational receipt와 rollback |
| P1 | Authentic operating evidence | fixture는 30-day reliability/performance/customer/revenue truth가 아니다. | issues #3 / #5 | production-origin time-bounded KPI, customer/revenue/legal transfer authority와 integrity binding |

## Completion discipline

각 gap은 표의 authoritative evidence가 current source/head에 실제로 결합될 때만 닫는다. Workflow가 exact head를 checkout한 뒤 실패하면 code/config/log RCA를 수행하고, runner를 얻지 못한 queued 상태는 control-plane evidence로만 취급한다. Queue를 줄이기 위한 source churn, `paths-ignore`, runner-selector 우회, self-approval, force push/destructive rebase, required-gate weakening은 완료 수단이 아니다.

Noema source의 Apache-2.0 grant, third-party license compatibility, package/artifact distribution rights, release/deployment, KPI, customer/revenue, legal/IP transfer evidence는 서로 별도 권위다. 문서, scanner, SBOM, successful CI 또는 model judgement가 빠진 권위 클래스를 만들어내지 않는다.
