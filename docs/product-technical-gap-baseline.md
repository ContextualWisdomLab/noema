# Noema Product and Technical Gap Baseline

## Authority and update rule

이 문서는 Noema의 protected truth, active candidate, transient workflow evidence, foreign-owner authority를 분리해 추적한다. 저장소 문서와 테스트는 해당 revision의 source contract만 증명하며, predecessor GREEN·queued/skipped/cancelled run·문서 존재·model judgement를 다음 단계의 권위로 전용하지 않는다. PR은 live protected base와 unchanged exact head에서 다시 검증하고, 외부 제품의 domain truth·LLM provider routing·quarantine/security·outbound authority는 Noema source로 복제하지 않는다.

현재 protected-source snapshot은 `main@5b8e620dbb01a794c1a38535bbcc32e41a80d0df`다. 이 revision은 protected #546 semantic reviewer, #544 immutable Context Graph consumer admission, #533 runner-assignment semantic evidence와 #552 cross-session coordination guidance를 포함한다. #552는 exact `1870679c0eea609bff94d72c888c8567d505c214`에서 application CI, reviewer-ci, required Security Scan, patch-validator-image가 모두 terminal success이고 unresolved review thread가 0인 상태에서 정상 merge되어 `5b8e620...`가 됐다.

## Live observation — 2026-09-06 KST

| Authority | Exact observation | Consequence |
| --- | --- | --- |
| Protected Noema | `main@5b8e620dbb01a794c1a38535bbcc32e41a80d0df` | Agent Runtime/Workflow foundation, semantic reviewer, Context Graph release-consumer admission, runner-assignment evidence와 cross-session coordination이 protected truth다. |
| Central workflow owner | `.github/main@43024633eba9d96b0456970391360da5a171fbda` | Central #1953은 Strix sandbox-bootstrap retry/verdict owner repair다. Noema가 그 retry/provider/security 구현을 복제하지 않는다. OIDC `job_workflow_sha`는 complete central source commit을 인증하므로 #527 exact pin은 이 SHA를 따라가야 한다. |
| OIDC trust candidate | PR #527 exact `d289bfcdb617249c90f9fcc1ba050a59334d07fd` | RED `beb196bf...`가 새 central SHA를 요구하고 production `ec5b1051...`가 `ALLOWED_WORKFLOW_SHA`만 `43024633...`로 rebind했다. Ordinary two-parent restack으로 protected #552 ancestry를 보존했다. Fresh exact-head CI/image는 pending, reviewer/Security는 queued이므로 Draft다. |
| Shared Kernel candidate | PR #536 exact `a1172fc2d50ae28b2e67c1696ce0578c16c5a6d9` | `noema-core`는 이미 해석된 PydanticAI `Model`을 받아 provider-neutral `Agent(..., retries=0)`만 구성한다. Provider discovery/credential/routing/retry/failover는 contextual-orchestrator authority다. Current main 대비 71 ahead / 0 behind이며 fresh exact-head 네 workflow는 queued다. |
| Workflow-concurrency candidate | PR #550 exact `12f8e3d9e74776156c9f70d29a5ef0ae0d25a96c` | PR supersession만 cancel하고 push/manual run identity를 보존하는 Noema repository-local concurrency delta를 protected #552 위에 non-force restack했다. Fresh exact-head 네 workflow는 queued다. |
| Reviewer evidence candidate | PR #548 exact `75f93fd5d16f3b56eafd0f12a0eabe14ee277766` | Failed-check evidence를 current-head source finding에 결합하고 `Finding.line`을 exact positive integer/None으로 제한하는 branch-owned delta를 protected #552 위에 restack했다. Fresh exact-head 네 workflow는 queued다. |
| Small post-#552 restacks | #539 `bb2f3b8bc734dc3926f2a0ac6b0265fae91040b3`; #543 `a6970ca89ee589368799b8c4b0656dec7b87c2a8`; #553 `722fa1202a51cc774cc71af1c0a0e34429c81bdd` | 각각 canonical temp-root fixture, required-gate suppression 금지 regression, automation threat-model correction을 protected #552 위에 ordinary/non-force restack했다. 모든 fresh exact-head CI/reviewer/Security/image가 queued라 predecessor GREEN을 전용하지 않는다. |
| Orchestrator/free lane | PR #535 exact `0a125fd51347c090b6265d9c1e25edf1fe049a43` | Branch-owned reviewer/config/privacy/tool boundary와 protected main이 `AGENTS.md`, `CLAUDE.md`, product gap baseline에서 겹친다. `SAFE_REVIEW_LABEL` ambient inheritance expectation은 이미 test-only로 수리됐지만 current protected main에 대한 semantic three-way restack이 아직 필요하다. CO가 provider/model authority를 계속 소유한다. |
| Toolchain/license lane | PR #540 exact `197fb05d83cf662ecfe8c3fa3fa00929579a5566` | `workerd@1.20260625.1` + `esbuild@0.28.1` candidate는 유효하지만 `.github/lockfile-change-policy.json.baseSha`가 아직 `71cd0fb...`라 current `main@5b8e620...` 기준 stale authority다. Package/lockfile bytes는 protected #552로 인해 변하지 않았으므로 exact base rebind와 product-gap semantic merge가 필요하다. |
| Durable Workflow / Task Execution | issue #541 / PR #542 exact `6953eaad292ea88d1b50bcb67011b473fb0eeb28` | Atomic claim, effect-start evidence, checkpoint CAS, recovery/cancellation, operation-stable payload minimization, nested projection, missing-state/storage-outage/unexpected-fault fail-closed contract는 Noema-owned candidate다. Protected main과 product-gap baseline이 겹쳐 semantic restack이 필요하다. |
| Acquisition evidence | PR #526 exact `81ef8b75aaad2083156b415e59fd7f27740a1b02` | `{path, sha256}` retained-source authority와 filesystem race/fail-closed repairs는 유효하다. Current protected acquisition/licensing evidence changes와 overlap하므로 wholesale tree replacement가 아니라 semantic three-way repair가 필요하다. SHA-256은 byte identity만 증명하며 buyer/legal truth를 만들지 않는다. |
| Documentation authority | PR #547 | 이 문서 lane은 current protected main, central owner movement와 active PR heads를 다시 결합하는 전용 repair lane이다. 이 파일 자체가 stale protected SHA/PR head를 남기면 code-current 조건을 만족하지 못한다. |
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
| P0 | Current-main convergence | Valid deltas가 stale base에 남으면 exact-head evidence와 merge authority가 갈라진다. | affected open PRs | ordinary/non-force semantic restack, current merge-base, unchanged exact-head terminal gates, zero valid findings |
| P0 | Atomic durable workflow authority | duplicate claim/effect, ambiguous recovery 또는 over-broad state transport가 long-running execution을 훼손한다. | issue #541 / #542 | single-winner claim, checkpoint CAS, recovery/cancellation/effect evidence, payload minimization, fail-closed fault classes, exact-head GREEN, protected merge |
| P0 | GPL-family development/build path | procurement·redistribution·clean-SBOM acceptance를 막는다. | issue #531 / #540 | current-base lock policy, regenerated deterministic lockfile, dependency/license/security/image/SBOM/provenance gates, protected merge |
| P0 | Exact central OIDC source pin | stale complete-source identity는 legitimate review를 거부하거나 equality 완화를 유도한다. | #527 + `.github` owner | audited current central protected SHA, exact Noema pin, current-head GREEN, protected merge |
| P0 | Reviewer/Maintainer production identity | independent least-authority review/publication을 운영 증거로 입증할 수 없다. | issues #29 / #227 | live installation/permissions/key custody/rotation과 bounded publication/recovery receipts |
| P0 | Governance enforceability | source test만으로 required review/history/rewrite/deletion 통제를 입증할 수 없다. | issue #27 / organization control plane | live ruleset/protection evidence와 required workflow behavior |
| P1 | Patch-validator publication | source image가 실제 immutable publication/signing/activation됐는지 구매자가 확인할 수 없다. | issue #66 | protected-source registry digest, signature/attestation, operational receipt와 rollback |
| P1 | Authentic operating evidence | fixture는 30-day reliability/performance/customer/revenue truth가 아니다. | issues #3 / #5 | production-origin time-bounded KPI, customer/revenue/legal transfer authority와 integrity binding |

## Completion discipline

각 gap은 표의 authoritative evidence가 current source/head에 실제로 결합될 때만 닫는다. Workflow가 exact head를 checkout한 뒤 실패하면 code/config/log RCA를 수행하고, runner를 얻지 못한 queued 상태는 control-plane evidence로만 취급한다. Queue를 줄이기 위한 source churn, `paths-ignore`, runner-selector 우회, self-approval, force push/destructive rebase, required-gate weakening은 완료 수단이 아니다.

Noema source의 Apache-2.0 grant, third-party license compatibility, package/artifact distribution rights, release/deployment, KPI, customer/revenue, legal/IP transfer evidence는 서로 별도 권위다. 문서, scanner, SBOM, successful CI 또는 model judgement가 빠진 권위 클래스를 만들어내지 않는다.
