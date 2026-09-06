# Noema Product and Technical Gap Baseline

## Authority and update rule

이 문서는 Noema의 protected truth, active candidate, transient workflow evidence, foreign-owner authority를 분리한다. 저장소 문서와 테스트는 해당 revision의 source contract만 증명하며 predecessor GREEN, queued/skipped/cancelled run, scanner/model judgement를 다음 revision의 권위로 전용하지 않는다. 외부 제품의 domain truth, LLM provider routing, quarantine/security, outbound authority는 Noema source로 복제하지 않는다.

현재 protected-source snapshot은 `main@e26d771470a4ece873c367b40b3cd6cb03ac7de3`다. 이 revision은 #546 semantic reviewer, #544 immutable Context Graph consumer admission, #533 runner-assignment semantic evidence, #552 cross-session coordination guidance와 #527 OIDC trust roll-forward를 포함한다. #527 exact `d289bfcdb617249c90f9fcc1ba050a59334d07fd`는 application CI, reviewer-ci, required Security Scan, patch-validator-image가 모두 terminal success이고 unresolved review thread가 0인 상태에서 정상 merge됐다.

Central workflow authority는 `.github/main@9aad23c09da468716a788cfed65cd44f7d84a284`다. `6e014c9bae22f1e6d8302a4f1cc38f4f6a114ae2` 이후 central #1975는 CodeQL/required-workflow queue contract test parser를 수리한 tests-only change이며 `.github/workflows/noema-review.yml` blob은 바꾸지 않았다. Noema는 central dispatch/provider/retry/sandbox/security 구현을 복제하지 않지만 GitHub OIDC `job_workflow_sha`가 reusable workflow의 source commit identity를 전달하므로 protected Noema와 predecessor candidates의 과거 `ALLOWED_WORKFLOW_SHA`는 current central source와 불일치한다. PR #554 exact `0866c5d9dcd263f1dd785164332f678f55228214`가 executable regression과 `wrangler.toml` pin을 `9aad23c...`에 함께 rebind하는 fail-closed consumer repair를 소유한다.

## Active candidate convergence — 2026-09-07 KST

#527 merge 뒤 open product/reviewer/documentation lane을 current protected ancestry로 ordinary two-parent/non-force 수렴시켰다. Branch-owned delta가 #527의 trust change와 겹치지 않은 lane은 exact protected blobs를 승계했고, semantic overlap이 있는 #542 `wrangler.toml`은 `NOEMA_WORKFLOW_STATE` binding/export와 당시 protected trust pin을 함께 보존했다. #540은 exact-base lockfile policy `baseSha`를 `e26d771...`로 먼저 rebind한 뒤 restack했다. 이후 central protected source가 계속 전진해 #554가 새로운 immutable workflow-source trust prerequisite가 됐다.

#542의 predecessor `1909f232dec32cf5d5de40d927af9c22366d2a85`는 native retained sequence-one root를 `initialized`로 강제해 hostile `checkpoint_committed` substitution을 막았지만, hosted CI `34039685783`에서 지원 대상인 pre-ledger pure-work recovery regression을 실제로 깨뜨렸다. Pre-ledger record에는 역사적 `initialized` receipt가 없으므로 첫 안전 claim이 sequence-one `task_claimed`가 되는 것이 정확한 observable provenance다. Current PR #542 exact `84a2cd056168ff90ad1c60723f20621ee8a73374`는 sequence-one root를 native `initialized` 또는 legacy-upgrade `task_claimed`로만 허용하며, 다른 root type과 field-contract 위반은 계속 fail closed한다. 이 repair는 hosted GREEN이 아니라 fresh verification 대상이다.

| Lane | Current exact head | Owned delta / boundary |
| --- | --- | --- |
| Central workflow trust roll-forward | PR #554 exact `0866c5d9dcd263f1dd785164332f678f55228214` | `job_workflow_sha` consumer pin only; central `.github` keeps agent-dispatch/provider/security implementation authority. |
| Reviewer failed-check evidence | PR #548 exact `049a57dd66be5c0bd23e764315676f7f0ee6efd6` | Failed-check → actionable source binding and exact positive `Finding.line`; no provider/security authority. |
| Shared Kernel | PR #536 exact `8415e3c5e5eb1ed0b276f2d1154f96691d1d4e69` | Provider-neutral `noema-core`; contextual-orchestrator remains provider/model owner. |
| Canonical temp-root fixtures | PR #539 exact `f2a1f4d048b816d09a74bac911cca21cc9cb1613` | Test-fixture path canonicalization only; production capability boundary unchanged. |
| Required-gate regression | PR #543 exact `f07679d0f4d78ed1668147e9cd8fde0ba82fe210` | Forbids docs-only suppression of required gates. |
| Automation threat model | PR #553 exact `4659f8be879568bbd1e8fe2b7248bf4f437fa885` | Corrects historical PR #80 language; no runtime authority change. |
| Workflow concurrency | PR #550 exact `ad0f512b054c4114203760311cb064e1a5323c43` | PR-only supersession cancellation and work-conserving handoff. |
| Orchestrator/free consumer | PR #535 exact `5de3fcb2a6acd1b8190ffab95f729fc6b160b0a8` | Noema consumer/privacy/tool boundary only; CO owns provider/model routing/retry/failover. |
| Acquisition evidence | PR #526 exact `bd4c9079b5c81c0cd63cae6fb0bdd4a845e9fbf2` | Retained `{path, sha256}` source identity plus protected package-digest contract; hashes do not create buyer/legal truth. |
| Toolchain/license | PR #540 exact `6b7f0a7b8c3069a815f74ee654620e59574bd4e1` | issue #531 / #540; lock policy is rebound to current protected base before restack. |
| Durable Workflow / Task Execution | issue #541 / PR #542 exact `84a2cd056168ff90ad1c60723f20621ee8a73374` | Atomic claim, effect-start, checkpoint CAS, recovery/cancellation, payload minimization, fail-closed fault classes and legacy-compatible bounded provenance. |
| Documentation authority | PR #547 | Dedicated cross-lane baseline writer; source is current to the heads above. |

Fresh exact-head workflow evidence is observation-scoped and must be refetched after each source mutation. No predecessor GREEN transfers.

## DDD and ownership baseline

Noema의 Core Domain은 **Agent Runtime**과 **Workflow / Task Execution**이다. **Tool / Capability Boundary**, **State / Checkpoint**, **Isolation Integration**, **Policy / Approval**, **Observability**, **Recovery**는 명시적 bounded context다. Side-effect authority, execution identity, claim/checkpoint CAS는 최소 transaction boundary에서 유지하고 foreign domain truth와 혼합하지 않는다.

`contextual-orchestrator`는 provider/model discovery, routing, TTC, retry/failover와 provider credentials를 소유한다. `.github`는 reusable workflow와 organization control-plane source를 소유한다. `quarantine-sandbox-runtime`, Wardnet, EgressWeave/AppGuardrail 계열은 각 isolation/security/outbound truth를 소유한다. Keyverse는 identity backend owner다. `context-graph-contracts`와 Enterprise Architecture 계열은 released/versioned contract만 소비하며 mutable sibling PR head, source copy, cross-service SQL을 runtime truth로 사용하지 않는다.

ADR 0012는 broader runtime-orchestration decision이 아직 넓기 때문에 `Proposed`를 유지한다. 이미 protected인 runtime/context-consumer slice를 Proposed라는 이유로 candidate로 되돌리지 않으며 candidate durable workflow state를 문서만으로 Accepted 처리하지 않는다.

## Commercial and buyer gaps

| Priority | Gap | Buyer/operator impact | Current owner | Authoritative completion evidence | Next executable action |
| --- | --- | --- | --- | --- | --- |
| P0 | Current central workflow-source trust | Protected Noema가 현재 central reviewer source를 신뢰하지 못하면 reusable review exchange가 fail closed된다. | PR #554 | current central protected SHA, exact consumer pin, unchanged exact-head CI/reviewer/Security/image, protected merge | #554 exact `0866c5d9...`의 새 네 gate를 끝까지 검증하고 live base·central head·review thread를 다시 읽은 뒤 정상 merge한다. |
| P0 | Current-main exact-head verification | predecessor GREEN을 전용하면 stale source가 merge authority로 승격될 수 있다. | affected open PRs | unchanged exact-head CI/reviewer/Security/image, current review/thread authority, normal merge | protected main 이동마다 branch-owned delta를 non-force restack하고 새 exact-head evidence를 생성한다. |
| P0 | Atomic durable workflow authority | 중복 side effect, checkpoint divergence, cancellation/recovery 오판이나 retained provenance 변조는 buyer runtime 신뢰성을 직접 훼손한다. | issue #541 / #542 | claim/checkpoint/recovery/effect invariants, payload minimization, native/legacy root semantics, fault classes, exact-head GREEN, protected merge | #542 exact `84a2cd...`에서 hosted RED 수리가 GREEN인지 먼저 검증하고, 선행 trust prerequisite 통합 뒤 non-force restack하여 네 gate와 review authority를 다시 생성한다. |
| P0 | GPL-family development/build path | 조직의 commercial inbound policy와 build toolchain이 충돌하면 distribution diligence가 fail closed된다. | issue #531 / #540 | current-base lock policy, deterministic lockfile, license/security/image/SBOM/provenance gates, protected merge | 선행 protected movement 후 #540 lock policy를 새 base에 rebind하고 동일 evidence를 재생성한다. |
| P0 | Reviewer/Maintainer production identity | source-only readiness로는 독립 review와 bounded publication authority를 입증할 수 없다. | issues #29 / #227 | live installation/permissions/key custody/rotation and bounded publication/recovery receipts | authorized external App provisioning과 protected-source preflight를 실제 control plane에서 수행한다. |
| P0 | Governance enforceability | required workflow 하나만으로 PR approval, history rewrite, deletion, break-glass 통제를 증명할 수 없다. | issue #27 / organization control plane | live ruleset/protection evidence and required workflow behavior | #554 통합 뒤 read-only governance audit을 재실행하고 미구성 controls는 authorized owner path에서 검증한다. |
| P1 | Patch-validator publication | PR-head image GREEN은 protected operational publication·signing·activation 증거가 아니다. | issue #66 | protected-source registry digest, signature/attestation, operational receipt and rollback | protected-main dispatch와 immutable publication identity가 가능한 owner control plane에서 운영 증거를 생성한다. |
| P1 | Authentic operating evidence | fixture와 repository checks로 30일 production KPI, customer/revenue, legal transfer truth를 만들 수 없다. | issue #3 / issue #5 | production-origin KPI, customer/revenue/legal transfer authority with integrity binding | governed immutable deployment 뒤 authenticated production evidence window와 transfer evidence를 수집·검증한다. |

## Completion discipline

Workflow가 exact head를 checkout한 뒤 실패하면 code/config/log RCA를 수행한다. Runner를 얻지 못한 queued 상태는 control-plane evidence일 뿐이다. Queue를 줄이기 위한 source churn, `paths-ignore`, runner-selector 우회, self-approval, force push/destructive rebase, required-gate weakening은 완료 수단이 아니다.

Noema source의 Apache-2.0 grant, third-party license compatibility, package/artifact distribution rights, release/deployment, KPI, customer/revenue, legal/IP transfer evidence는 서로 별도 권위다. 문서, scanner, SBOM, successful CI 또는 model judgement가 빠진 권위 클래스를 만들어내지 않는다.
