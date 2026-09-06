# Noema Product and Technical Gap Baseline

## Authority and update rule

이 문서는 Noema의 protected truth, active candidate, transient workflow evidence, foreign-owner authority를 분리한다. 저장소 문서와 테스트는 해당 revision의 source contract만 증명하며 predecessor GREEN, queued/skipped/cancelled run, scanner/model judgement를 다음 revision의 권위로 전용하지 않는다. 외부 제품의 domain truth, LLM provider routing, quarantine/security, outbound authority는 Noema source로 복제하지 않는다.

현재 protected-source snapshot은 `main@8cbb07da2a9a7e4e9b782c40bf7b6a1567e7b18d`다. 이 revision은 기존 #546 semantic reviewer, #544 immutable Context Graph consumer admission, #533 runner-assignment semantic evidence, #552 cross-session coordination guidance와 #527 OIDC trust roll-forward에 더해 정상 병합된 #539 canonical temp-root fixture repair를 포함한다. #539 exact `f2a1f4d048b816d09a74bac911cca21cc9cb1613`는 application CI, reviewer-ci, required Security Scan, patch-validator-image가 terminal success이고 current review authority가 clear한 상태에서 normal merge됐으며 production capability boundary를 바꾸지 않았다.

Central workflow authority는 `.github/main@c9052e607e5f3cc76e73207e7786b21500721b79`다. 직전 protected central에서 이 revision으로의 변화는 `scripts/ci/audit_org_codeql_coverage.py`와 `tests/test_audit_org_codeql_coverage.py`뿐이며 `.github/workflows/noema-review.yml`은 blob `f8ab55c896e8b40dde0bddd89bab37868dda9283`를 유지한다. Noema는 central dispatch/provider/retry/sandbox/security 구현을 복제하지 않는다. 다만 GitHub OIDC `job_workflow_sha`가 reusable workflow의 source commit identity를 전달하므로 protected Noema의 현재 trust pin과 central protected source가 불일치하는 동안 reusable reviewer exchange는 fail closed되어야 한다. PR #554 exact `01c0a0061a360ea1e3a9586e67744466f7544672`가 executable regression과 `wrangler.toml` pin을 `c9052e6...`에 함께 rebind하는 좁은 consumer repair를 소유한다.

Traceability를 위해 superseded predecessor `.github/main@bf0bf0ab0c9ebcf4cea05f8c9219dc093f9ab351` / PR #554 exact `e94d3ee884a120269fc42cf09ecbab6d0461b4ef`를 역사적 lineage로만 기록한다. 이 predecessor identity는 current merge authority나 release evidence가 아니다.

## Active candidate convergence — 2026-09-07 KST

#539 정상 병합으로 protected ancestry가 전진했다. 그 이전 exact-head GREEN은 새 protected ancestry의 merge authority가 아니며, #554가 central trust prerequisite로 먼저 통합된 뒤 downstream branch-owned delta를 ordinary/non-force restack하고 fresh evidence를 생성해야 한다. Cross-lane baseline은 이 PR #547 하나만 쓴다.

Durable workflow lane에서는 predecessor exact head의 hosted CI `34044694252` / job `101517546387`가 checkout, live-base guard, lockfile/install/typecheck를 통과하고 577 test files / 4,078 tests를 모두 PASS했지만 global coverage 99.98%로 실패했다. 유일한 미실행 production 경로는 retained transition receipt가 record가 아닐 때 fail closed하는 branch였다. Current PR #542 exact `2bb6076d911a526570176294c99fd86421c152eb`는 production semantics를 건드리거나 100% gate를 약화하지 않고 `null` retained receipt를 거부하는 hostile regression만 추가했다. 이후 current protected `main@8cbb07d...`가 branch ancestry보다 앞서면서 live-base guard가 RED가 됐으므로, 이는 workflow implementation defect가 아니라 계획된 post-#554 restack prerequisite다.

| Lane | Current exact head | Owned delta / boundary |
| --- | --- | --- |
| Central workflow trust roll-forward | PR #554 exact `01c0a0061a360ea1e3a9586e67744466f7544672` | `job_workflow_sha` consumer pin only; central `.github` keeps agent-dispatch/provider/security implementation authority. |
| Reviewer failed-check evidence | PR #548 exact `049a57dd66be5c0bd23e764315676f7f0ee6efd6` | Failed-check → actionable source binding and exact positive `Finding.line`; no provider/security authority. |
| Shared Kernel | PR #536 exact `8415e3c5e5eb1ed0b276f2d1154f96691d1d4e69` | Provider-neutral `noema-core`; contextual-orchestrator remains provider/model owner. |
| Required-gate regression | PR #543 exact `f07679d0f4d78ed1668147e9cd8fde0ba82fe210` | Forbids docs-only suppression of required gates. |
| Automation threat model | PR #553 exact `4659f8be879568bbd1e8fe2b7248bf4f437fa885` | Corrects historical PR #80 language; no runtime authority change. |
| Workflow concurrency | PR #550 exact `ad0f512b054c4114203760311cb064e1a5323c43` | PR-only supersession cancellation and work-conserving handoff. |
| Orchestrator/free consumer | PR #535 exact `5de3fcb2a6acd1b8190ffab95f729fc6b160b0a8` | Noema consumer/privacy/tool boundary only; CO owns provider/model routing/retry/failover. |
| Acquisition evidence | PR #526 exact `bd4c9079b5c81c0cd63cae6fb0bdd4a845e9fbf2` | Retained `{path, sha256}` source identity plus protected package-digest contract; hashes do not create buyer/legal truth. |
| Toolchain/license | PR #540 exact `6b7f0a7b8c3069a815f74ee654620e59574bd4e1` | issue #531 / #540; exact-base lock policy must be rebound after protected movement before integration. |
| Durable Workflow / Task Execution | issue #541 / PR #542 exact `2bb6076d911a526570176294c99fd86421c152eb` | Atomic claim, effect-start, checkpoint CAS, recovery/cancellation, payload minimization, fail-closed fault classes, legacy-compatible bounded provenance, and explicit coverage of malformed retained receipts. |
| Documentation authority | PR #547 | Dedicated cross-lane baseline writer; source is current to the protected/candidate identities above. |

Fresh exact-head workflow evidence is observation-scoped and must be refetched after each source mutation or restack. No predecessor GREEN transfers. At this observation, #554 exact `01c0a006...` has fresh `ci 34055038152`, `reviewer-ci 34055038095`, required `Security Scan 34055038128`, and `patch-validator-image 34055038153`; all four were queued immediately after the causal repair and therefore are not GREEN evidence.

## DDD and ownership baseline

Noema의 Core Domain은 **Agent Runtime**과 **Workflow / Task Execution**이다. **Tool / Capability Boundary**, **State / Checkpoint**, **Isolation Integration**, **Policy / Approval**, **Observability**, **Recovery**는 명시적 bounded context다. Side-effect authority, execution identity, claim/checkpoint CAS는 최소 transaction boundary에서 유지하고 foreign domain truth와 혼합하지 않는다.

`contextual-orchestrator`는 provider/model discovery, routing, TTC, retry/failover와 provider credentials를 소유한다. `.github`는 reusable workflow와 organization control-plane source를 소유한다. `quarantine-sandbox-runtime`, Wardnet, EgressWeave/AppGuardrail 계열은 각 isolation/security/outbound truth를 소유한다. Keyverse는 identity backend owner다. `context-graph-contracts`와 Enterprise Architecture 계열은 released/versioned contract만 소비하며 mutable sibling PR head, source copy, cross-service SQL을 runtime truth로 사용하지 않는다.

ADR 0012는 broader runtime-orchestration decision이 아직 넓기 때문에 `Proposed`를 유지한다. 이미 protected인 runtime/context-consumer slice를 Proposed라는 이유로 candidate로 되돌리지 않으며 candidate durable workflow state를 문서만으로 Accepted 처리하지 않는다.

## Commercial and buyer gaps

| Priority | Gap | Buyer/operator impact | Current owner | Authoritative completion evidence | Next executable action |
| --- | --- | --- | --- | --- | --- |
| P0 | Current central workflow-source trust | Protected Noema가 현재 central reviewer source를 신뢰하지 못하면 reusable review exchange가 fail closed된다. | PR #554 | current central protected SHA, exact consumer pin, unchanged exact-head CI/reviewer/Security/image, protected merge | #554 exact `01c0a006...`의 fresh 네 gate와 live base·central head·review thread를 확인한 뒤 정상 merge한다. |
| P0 | Current-main exact-head verification | predecessor GREEN을 전용하면 stale source가 merge authority로 승격될 수 있다. | affected open PRs | unchanged exact-head CI/reviewer/Security/image, current review/thread authority, normal merge | #554 통합 뒤 branch-owned delta를 새 protected main에 ordinary/non-force restack하고 fresh exact-head evidence를 생성한다. |
| P0 | Atomic durable workflow authority | 중복 side effect, checkpoint divergence, cancellation/recovery 오판이나 retained provenance 변조는 buyer runtime 신뢰성을 직접 훼손한다. | issue #541 / #542 | claim/checkpoint/recovery/effect invariants, payload minimization, native/legacy root semantics, hostile malformed-receipt coverage, exact-head GREEN, protected merge | #554 통합 뒤 #542를 새 protected main에 non-force restack하고 네 gate와 review authority를 다시 생성한다. |
| P0 | GPL-family development/build path | 조직의 commercial inbound policy와 build toolchain이 충돌하면 distribution diligence가 fail closed된다. | issue #531 / #540 | current-base lock policy, deterministic lockfile, license/security/image/SBOM/provenance gates, protected merge | 선행 protected movement 후 #540 lock policy를 새 base에 rebind하고 동일 evidence를 재생성한다. |
| P0 | Reviewer/Maintainer production identity | source-only readiness로는 독립 review와 bounded publication authority를 입증할 수 없다. | issues #29 / #227 | live installation/permissions/key custody/rotation and bounded publication/recovery receipts | authorized external App provisioning과 protected-source preflight를 실제 control plane에서 수행한다. |
| P0 | Governance enforceability | required workflow 하나만으로 PR approval, history rewrite, deletion, break-glass 통제를 증명할 수 없다. | issue #27 / organization control plane | live ruleset/protection evidence and required workflow behavior | #554 통합 뒤 read-only governance audit을 재실행하고 미구성 controls는 authorized owner path에서 검증한다. |
| P1 | Patch-validator publication | PR-head image GREEN은 protected operational publication·signing·activation 증거가 아니다. | issue #66 | protected-source registry digest, signature/attestation, operational receipt and rollback | protected-main dispatch와 immutable publication identity가 가능한 owner control plane에서 운영 증거를 생성한다. |
| P1 | Authentic operating evidence | fixture와 repository checks로 30일 production KPI, customer/revenue, legal transfer truth를 만들 수 없다. | issue #3 / issue #5 | production-origin KPI, customer/revenue/legal transfer authority with integrity binding | governed immutable deployment 뒤 authenticated production evidence window와 transfer evidence를 수집·검증한다. |

## Completion discipline

Workflow가 exact head를 checkout한 뒤 실패하면 code/config/log RCA를 수행한다. Runner를 얻지 못한 queued 상태는 control-plane evidence일 뿐이다. Queue를 줄이기 위한 source churn, `paths-ignore`, runner-selector 우회, self-approval, force push/destructive rebase, required-gate weakening은 완료 수단이 아니다.

Noema source의 Apache-2.0 grant, third-party license compatibility, package/artifact distribution rights, release/deployment, KPI, customer/revenue, legal/IP transfer evidence는 서로 별도 권위다. 문서, scanner, SBOM, successful CI 또는 model judgement가 빠진 권위 클래스를 만들어내지 않는다.
