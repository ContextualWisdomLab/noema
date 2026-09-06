# Noema Product and Technical Gap Baseline

## Authority and update rule

이 문서는 Noema의 protected truth, active candidate, transient workflow evidence, foreign-owner authority를 분리한다. 저장소 문서와 테스트는 해당 revision의 source contract만 증명하며 predecessor GREEN, queued/skipped/cancelled run, scanner/model judgement를 다음 revision의 권위로 전용하지 않는다. 외부 제품의 domain truth, LLM provider routing, quarantine/security, outbound authority는 Noema source로 복제하지 않는다.

현재 protected-source snapshot은 `main@0dec8d84b1e4744e7a9c6a77e2e2631a183ee2ab`다. 이 revision은 #546 semantic reviewer, #544 immutable Context Graph consumer admission, #533 runner-assignment semantic evidence, #552 cross-session coordination guidance, 정상 병합된 #539 canonical temp-root fixture repair에 더해 #554의 exact central workflow-source trust roll-forward를 정상 병합한 protected truth다. 직전 protected `main@8cbb07da2a9a7e4e9b782c40bf7b6a1567e7b18d`는 역사적 branch point로만 남으며 current merge/release authority가 아니다.

Central workflow authority는 `.github/main@c9052e607e5f3cc76e73207e7786b21500721b79`다. 직전 protected central에서 이 revision으로의 변화는 `scripts/ci/audit_org_codeql_coverage.py`와 `tests/test_audit_org_codeql_coverage.py`뿐이며 `.github/workflows/noema-review.yml`은 blob `f8ab55c896e8b40dde0bddd89bab37868dda9283`를 유지한다. Noema는 central dispatch/provider/retry/sandbox/security 구현을 복제하지 않는다. GitHub OIDC `job_workflow_sha`가 reusable workflow의 source commit identity를 전달하므로 Noema는 exact protected central source만 fail-closed consumer trust로 받는다. PR #554 exact `01c0a0061a360ea1e3a9586e67744466f7544672` integrated normally after application CI, reviewer-ci, required Security Scan, patch-validator-image가 모두 unchanged exact head에서 terminal success였고, protected merge commit `0dec8d84b1e4744e7a9c6a77e2e2631a183ee2ab`가 `ALLOWED_WORKFLOW_SHA = c9052e607e5f3cc76e73207e7786b21500721b79`를 protected truth로 승격했다.

Traceability를 위해 superseded predecessor `.github/main@bf0bf0ab0c9ebcf4cea05f8c9219dc093f9ab351` / PR #554 exact `e94d3ee884a120269fc42cf09ecbab6d0461b4ef`를 역사적 lineage로만 기록한다. 같은 이유로 #554 직전 protected `main@8cbb07da2a9a7e4e9b782c40bf7b6a1567e7b18d`와 pre-restack PR #542 exact `2bb6076d911a526570176294c99fd86421c152eb`도 predecessor evidence일 뿐이다. 이 identity들은 current merge authority나 release evidence가 아니다.

## Active candidate convergence — 2026-09-07 KST

#554가 정상 병합되어 central workflow-source trust prerequisite의 source gap은 닫혔다. 그 직후 Durable Workflow / Task Execution owner #542는 predecessor `2bb6076...`와 protected `main@0dec8d84...`를 부모로 하는 ordinary/non-force restack `7f743f4ee8d81c8d52511ef421d8e40a32edf2a8`로 전진했다. Fresh compare의 merge-base는 정확히 `0dec8d84...`, `behind_by=0`이며, branch-owned durable-state delta와 protected #539/#554 delta를 함께 보존한다. `wrangler.toml`에는 `NOEMA_WORKFLOW_STATE` / `NoemaWorkflowState`와 current `ALLOWED_WORKFLOW_SHA = c9052e6...`가 동시에 존재한다.

같은 protected movement에 branch-owned files가 겹치지 않는 #526, #535, #536, #543, #548, #550, #553도 각각 기존 exact head와 `main@0dec8d84...`를 부모로 하는 ordinary two-parent/non-force restack으로 전진했다. 새 exact heads는 #526 `399d51d24bab96d204f232036938da7ab1034aa3`, #535 `9ec7fbb0a20fb771516682946d49a2755035c171`, #536 `82366b27fc985512c91242542d841169e76c347e`, #543 `e255bf1bece1ebfdd2432c96ee3aa14a7f29a992`, #548 `e24d31068e1a537b6e7cc4a4ec4ed8d68dca47f0`, #550 `3ed5bd956c84e6dd2ebe604dc226fea82145ac29`, #553 `a016521ed61857de328606ca7fea97c7a4057574`다. 각 branch ref는 `force=false`로만 전진했고 protected #539 canonical-temp-root와 #554 trust-source files를 main에서 상속한다. 이 restack 전 heads인 PR #548 exact `049a57dd66be5c0bd23e764315676f7f0ee6efd6`, PR #536 exact `8415e3c5e5eb1ed0b276f2d1154f96691d1d4e69`, PR #543 exact `f07679d0f4d78ed1668147e9cd8fde0ba82fe210`, PR #553 exact `4659f8be879568bbd1e8fe2b7248bf4f437fa885`, PR #550 exact `ad0f512b054c4114203760311cb064e1a5323c43`, PR #535 exact `5de3fcb2a6acd1b8190ffab95f729fc6b160b0a8`, PR #526 exact `bd4c9079b5c81c0cd63cae6fb0bdd4a845e9fbf2`는 기존 documentation contract와 audit traceability를 위해 predecessor lineage로만 보존한다.

#540은 예외다. Toolchain/license lane의 `.github/lockfile-change-policy.json`이 protected base의 exact SHA를 evidence로 고정하므로, 기존 `baseSha=e26d771...`를 current protected `0dec8d84...`로 먼저 causal rebind하지 않고 단순 tree overlay만 하면 의도적으로 lockfile-policy RED가 된다. 따라서 #540은 old exact `6b7f0a7b8c3069a815f74ee654620e59574bd4e1`에서 멈춰 있으며 exact-base policy source repair와 그 뒤 ordinary/non-force restack이 남아 있다. Cross-lane baseline은 이 PR #547 하나만 쓴다.

Durable workflow lane에서는 predecessor `84a2cd056168ff90ad1c60723f20621ee8a73374`의 hosted CI `34044694252` / job `101517546387`가 checkout, live-base guard, lockfile/install/typecheck를 통과하고 577 test files / 4,078 tests를 모두 PASS했지만 global coverage 99.98%로 실패했다. 유일한 미실행 production 경로는 retained transition receipt가 record가 아닐 때 fail closed하는 branch였다. `2bb6076d911a526570176294c99fd86421c152eb`는 production semantics나 100% gate를 약화하지 않고 `null` retained receipt를 거부하는 hostile regression을 추가했다. 이후 stale-base RED는 #554 merge 뒤 ordinary/non-force restack `7f743f4...`로 causal repair되었고, predecessor reviewer/Security/image success는 새 head에 전용하지 않았다.

| Lane | Current exact head | Owned delta / boundary |
| --- | --- | --- |
| Central workflow trust | protected `main@0dec8d84b1e4744e7a9c6a77e2e2631a183ee2ab`; merged PR #554 exact `01c0a0061a360ea1e3a9586e67744466f7544672` | `job_workflow_sha` consumer pin only; central `.github` keeps agent-dispatch/provider/security implementation authority. |
| Reviewer failed-check evidence | PR #548 exact `e24d31068e1a537b6e7cc4a4ec4ed8d68dca47f0` | Failed-check → actionable source binding and exact positive `Finding.line`; no provider/security authority. |
| Shared Kernel | PR #536 exact `82366b27fc985512c91242542d841169e76c347e` | Provider-neutral `noema-core`; contextual-orchestrator remains provider/model owner. |
| Required-gate regression | PR #543 exact `e255bf1bece1ebfdd2432c96ee3aa14a7f29a992` | Forbids docs-only suppression of required gates. |
| Automation threat model | PR #553 exact `a016521ed61857de328606ca7fea97c7a4057574` | Corrects historical PR #80 language; no runtime authority change. |
| Workflow concurrency | PR #550 exact `3ed5bd956c84e6dd2ebe604dc226fea82145ac29` | PR-only supersession cancellation and work-conserving handoff. |
| Orchestrator/free consumer | PR #535 exact `9ec7fbb0a20fb771516682946d49a2755035c171` | Noema consumer/privacy/tool boundary only; CO owns provider/model routing/retry/failover. |
| Acquisition evidence | PR #526 exact `399d51d24bab96d204f232036938da7ab1034aa3` | Retained `{path, sha256}` source identity plus protected package-digest contract; hashes do not create buyer/legal truth. |
| Toolchain/license | PR #540 exact `6b7f0a7b8c3069a815f74ee654620e59574bd4e1` | issue #531 / #540; exact-base lock policy must be rebound from `e26d771...` to current protected `0dec8d84...` before restack. |
| Durable Workflow / Task Execution | issue #541 / PR #542 exact `7f743f4ee8d81c8d52511ef421d8e40a32edf2a8` | Atomic claim, effect-start, checkpoint CAS, recovery/cancellation, payload minimization, fail-closed fault classes, legacy-compatible bounded provenance, explicit malformed-receipt coverage, and current protected trust-source composition. |
| Documentation authority | PR #547 | Dedicated cross-lane baseline writer; source is current to the protected/candidate identities above. |

Fresh exact-head workflow evidence is observation-scoped and must be refetched after each source mutation or restack. No predecessor GREEN transfers. At this observation, #542 exact `7f743f4...` has `reviewer-ci 34063013418` terminal success while `ci 34063013448` and `patch-validator-image 34063013474` are in progress and required `Security Scan 34063013567` remains queued. The newly restacked #526/#535/#536/#543/#548/#550/#553 generations have fresh exact-head workflow generations and were still queued at their first post-restack observation; queued state is not GREEN evidence.

## DDD and ownership baseline

Noema의 Core Domain은 **Agent Runtime**과 **Workflow / Task Execution**이다. **Tool / Capability Boundary**, **State / Checkpoint**, **Isolation Integration**, **Policy / Approval**, **Observability**, **Recovery**는 명시적 bounded context다. Side-effect authority, execution identity, claim/checkpoint CAS는 최소 transaction boundary에서 유지하고 foreign domain truth와 혼합하지 않는다.

`contextual-orchestrator`는 provider/model discovery, routing, TTC, retry/failover와 provider credentials를 소유한다. `.github`는 reusable workflow와 organization control-plane source를 소유한다. `quarantine-sandbox-runtime`, Wardnet, EgressWeave/AppGuardrail 계열은 각 isolation/security/outbound truth를 소유한다. Keyverse는 identity backend owner다. `context-graph-contracts`와 Enterprise Architecture 계열은 released/versioned contract만 소비하며 mutable sibling PR head, source copy, cross-service SQL을 runtime truth로 사용하지 않는다.

ADR 0012는 broader runtime-orchestration decision이 아직 넓기 때문에 `Proposed`를 유지한다. 이미 protected인 runtime/context-consumer slice를 Proposed라는 이유로 candidate로 되돌리지 않으며 candidate durable workflow state를 문서만으로 Accepted 처리하지 않는다.

## Commercial and buyer gaps

| Priority | Gap | Buyer/operator impact | Current owner | Authoritative completion evidence | Next executable action |
| --- | --- | --- | --- | --- | --- |
| P0 | Central workflow-source drift watch | Central protected source가 다시 움직였는데 Noema trust pin이 따라가지 못하면 reusable review exchange가 fail closed된다. | protected main / `.github` owner path | current central protected SHA, matching protected consumer pin, exact source lineage | 매 fresh sweep에서 central과 Noema pin을 비교하고, central source identity가 전진하면 좁은 successor trust repair를 즉시 만든다. |
| P0 | Current-main exact-head verification | predecessor GREEN을 전용하면 stale source가 merge authority로 승격될 수 있다. | affected open PRs | unchanged exact-head CI/reviewer/Security/image, current review/thread authority, normal merge | current protected ancestry에 수렴한 #526/#535/#536/#542/#543/#548/#550/#553의 새 workflow 세대를 검증하고 실패 시 각 lane에서 RCA/수정한다. |
| P0 | Atomic durable workflow authority | 중복 side effect, checkpoint divergence, cancellation/recovery 오판이나 retained provenance 변조는 buyer runtime 신뢰성을 직접 훼손한다. | issue #541 / #542 | claim/checkpoint/recovery/effect invariants, payload minimization, native/legacy root semantics, hostile malformed-receipt coverage, exact-head GREEN, protected merge | #542 exact `7f743f4...`의 남은 CI/Security/image와 live base·review authority를 확인하고 실패 시 RCA/수정, 모두 GREEN이면 정상 merge한다. |
| P0 | GPL-family development/build path | 조직의 commercial inbound policy와 build toolchain이 충돌하면 distribution diligence가 fail closed된다. | issue #531 / #540 | current-base lock policy, deterministic lockfile, license/security/image/SBOM/provenance gates, protected merge | #540 `.github/lockfile-change-policy.json.baseSha`를 current protected `0dec8d84...`로 causal rebind한 뒤 ordinary/non-force restack하고 exact-head evidence를 재생성한다. |
| P0 | Reviewer/Maintainer production identity | source-only readiness로는 독립 review와 bounded publication authority를 입증할 수 없다. | issues #29 / #227 | live installation/permissions/key custody/rotation and bounded publication/recovery receipts | authorized external App provisioning과 protected-source preflight를 실제 control plane에서 수행한다. |
| P0 | Governance enforceability | required workflow 하나만으로 PR approval, history rewrite, deletion, break-glass 통제를 증명할 수 없다. | issue #27 / organization control plane | live ruleset/protection evidence and required workflow behavior | current protected main 기준 read-only governance audit을 재실행하고 미구성 controls는 authorized owner path에서 검증한다. |
| P1 | Patch-validator publication | PR-head image GREEN은 protected operational publication·signing·activation 증거가 아니다. | issue #66 | protected-source registry digest, signature/attestation, operational receipt and rollback | protected-main dispatch와 immutable publication identity가 가능한 owner control plane에서 운영 증거를 생성한다. |
| P1 | Authentic operating evidence | fixture와 repository checks로 30일 production KPI, customer/revenue, legal transfer truth를 만들 수 없다. | issue #3 / issue #5 | production-origin KPI, customer/revenue/legal transfer authority with integrity binding | governed immutable deployment 뒤 authenticated production evidence window와 transfer evidence를 수집·검증한다. |

## Completion discipline

Workflow가 exact head를 checkout한 뒤 실패하면 code/config/log RCA를 수행한다. Runner를 얻지 못한 queued 상태는 control-plane evidence일 뿐이다. Queue를 줄이기 위한 source churn, `paths-ignore`, runner-selector 우회, self-approval, force push/destructive rebase, required-gate weakening은 완료 수단이 아니다.

Noema source의 Apache-2.0 grant, third-party license compatibility, package/artifact distribution rights, release/deployment, KPI, customer/revenue, legal/IP transfer evidence는 서로 별도 권위다. 문서, scanner, SBOM, successful CI 또는 model judgement가 빠진 권위 클래스를 만들어내지 않는다.
