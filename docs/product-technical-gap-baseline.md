# Noema Product and Technical Gap Baseline

## Authority and update rule

이 문서는 Noema의 protected truth, active candidate, transient workflow evidence, foreign-owner authority를 분리한다. 저장소 문서와 테스트는 해당 revision의 source contract만 증명하며 predecessor GREEN, queued/skipped/cancelled run, scanner/model judgement를 다음 revision의 권위로 전용하지 않는다. 외부 제품의 domain truth, LLM provider routing, quarantine/security, outbound authority는 Noema source로 복제하지 않는다.

현재 protected-source snapshot은 `main@d9b2a956960be72a5370afa50275a405dfbba529`다. 이 revision은 #546 semantic reviewer, #544 immutable Context Graph consumer admission, #533 runner-assignment semantic evidence, #552 cross-session coordination guidance, #539 canonical temp-root fixture repair, #554 exact central workflow-source trust roll-forward에 더해 acquisition source-evidence binding #526을 정상 병합한 protected truth다. 직전 protected `main@0dec8d84b1e4744e7a9c6a77e2e2631a183ee2ab`는 역사적 branch point로만 남으며 current merge/release authority가 아니다. Normal merge commit `d9b2a956960be72a5370afa50275a405dfbba529`는 previous protected main과 merged PR #526 exact `399d51d24bab96d204f232036938da7ab1034aa3`를 부모로 보존한다. #526의 retained `{path, sha256}` source identity와 package-digest evidence는 protected source integrity를 강화하지만 buyer/legal/commercial authenticity를 새로 만들지는 않는다.

Central workflow authority는 `.github/main@c9052e607e5f3cc76e73207e7786b21500721b79`다. 직전 protected central에서 이 revision으로의 변화는 CodeQL coverage audit source/test뿐이며 `.github/workflows/noema-review.yml`의 reviewed workflow body는 변하지 않았다. Noema는 central dispatch/provider/retry/sandbox/security 구현을 복제하지 않는다. GitHub OIDC `job_workflow_sha`가 reusable workflow의 source commit identity를 전달하므로 Noema는 exact protected central source만 fail-closed consumer trust로 받는다. PR #554 exact `01c0a0061a360ea1e3a9586e67744466f7544672` integrated normally after application CI, reviewer-ci, required Security Scan, patch-validator-image가 모두 unchanged exact head에서 terminal success였고, predecessor protected merge가 `ALLOWED_WORKFLOW_SHA = c9052e607e5f3cc76e73207e7786b21500721b79`를 protected truth로 승격했다.

Traceability를 위해 superseded predecessor `.github/main@bf0bf0ab0c9ebcf4cea05f8c9219dc093f9ab351` / PR #554 exact `e94d3ee884a120269fc42cf09ecbab6d0461b4ef`를 역사적 lineage로만 기록한다. Pre-#554 durable-workflow identities와 earlier protected branch points도 predecessor evidence일 뿐 current merge authority나 release evidence가 아니다.

## Active candidate convergence — 2026-09-07 KST

#526은 더 이상 active candidate가 아니라 protected truth다. 남은 open source lanes는 protected ancestry 이동을 bulk-rewrite하지 않고, overlap과 buyer risk를 고려해 ordinary/non-force restack으로 순차 수렴한다. 한 lane의 queued check는 그 lane만 막으며, 다른 safe review·documentation·owner-path work는 계속한다.

Required-gate regression #543은 predecessor branch delta를 새 protected main에 ordinary/non-force restack한 PR #543 exact `b14b37ca12b3b6ae1999d250a393997ffff04dec`로 수렴했다. 이 head는 `test/ci-exact-head-contract.test.ts`만 branch-owned delta로 유지하고 protected #526 acquisition files를 main에서 상속한다. Fresh current-head runs `ci 34071938887`, `reviewer-ci 34071938888`, required `Security Scan 34071938889`, `patch-validator-image 34071938978`은 현재 queued이며 predecessor GREEN은 전용하지 않는다.

Automation threat-model lane도 protected main에 ordinary/non-force restack했다. PR #553 exact `4c213e184b94b70558092ca739990464f889f06c`는 `docs/automation-threat-model.md`와 `test/documentation-architecture-contract.test.ts`만 branch-owned delta로 유지한다. Fresh current-head runs `ci 34072254372`, `reviewer-ci 34072254382`, required `Security Scan 34072254380`, `patch-validator-image 34072254418`은 현재 queued다.

Durable Workflow / Task Execution owner PR #542 exact `46439b1095da6a6dfd44067fda1b35fb8938849b`는 atomic claim, effect-start, checkpoint CAS, recovery/cancellation, payload minimization, fail-closed fault classes, legacy-compatible bounded provenance와 malformed retained-receipt hostile fixture repair를 보존한다. 이 head는 predecessor `4616b5e93e19d51973aea330aa4124b51725b795`와 protected `main@d9b2a956...`를 부모로 하는 ordinary/non-force restack이며, #526 acquisition delta와 #542의 29개 owned path 사이에 changed-path overlap이 없다. Fresh compare는 `behind_by=0`, merge-base는 current protected main이다. Fresh current-head runs `ci 34073438522`, `reviewer-ci 34073438512`, required `Security Scan 34073438480`, `patch-validator-image 34073438562`가 새 generation으로 생성됐으며 predecessor GREEN은 전용하지 않는다.

Toolchain/license PR #540 exact `2eba9d6b1e3365f745dd43bb8e40e87b0f2ead3a`는 exact-base lock policy, Wrangler/Miniflare/Sharp 제거와 pinned workerd/esbuild boundary를 보존하지만 아직 #526 이전 ancestry다. #550과 CI/image workflow path가 겹치므로 두 lane을 semantic merge해야 한다.

Orchestrator/free consumer PR #535 exact `a6fc483fe9537c5881114db82cc9f741eb8331b1`는 stale `NOEMA_LLM_MODEL=contextual-orchestrator` service-name 값을 `orchestrator/free`로 조용히 보정하지 않고 fail closed하는 production contract와 Python reviewer oracle repair에 더해, TypeScript gateway-routing regression도 같은 fail-closed expectation으로 수렴시킨다. Noema는 provider/model discovery, routing, retry/failover를 가져오지 않는다. `contextual-orchestrator`가 그 authority를 계속 소유한다. 이 head는 여전히 #526 이전 ancestry라 merge 전에 fresh non-force convergence가 필요하다.

Reviewer failed-check evidence PR #548 exact `e24d31068e1a537b6e7cc4a4ec4ed8d68dca47f0`, provider-neutral Shared Kernel PR #536 exact `82366b27fc985512c91242542d841169e76c347e`, workflow concurrency PR #550 exact `3ed5bd956c84e6dd2ebe604dc226fea82145ac29`도 각 branch-owned delta를 유지한 채 새 protected ancestry에 순차 수렴해야 한다. #535/#536/#548은 reviewer/shared-core path가 겹치고 #535/#550은 product-development workflow, #540/#550은 CI/image workflow path가 겹치므로 blind overlay가 아니라 semantic preservation이 필요하다.

| Lane | Current exact head | Owned delta / boundary |
| --- | --- | --- |
| Central workflow trust | protected `main@d9b2a956960be72a5370afa50275a405dfbba529`; merged PR #554 exact `01c0a0061a360ea1e3a9586e67744466f7544672` | `job_workflow_sha` consumer pin only; central `.github` keeps agent-dispatch/provider/security implementation authority. |
| Acquisition evidence | protected `main@d9b2a956960be72a5370afa50275a405dfbba529`; merged PR #526 exact `399d51d24bab96d204f232036938da7ab1034aa3` | Retained `{path, sha256}` source identity plus protected package-digest contract; hashes do not create buyer/legal truth. |
| Required-gate regression | PR #543 exact `b14b37ca12b3b6ae1999d250a393997ffff04dec` | Forbids docs-only suppression of required gates; current protected ancestry, exact-head gates pending. |
| Automation threat model | PR #553 exact `4c213e184b94b70558092ca739990464f889f06c` | Corrects historical PR #80 language; no runtime authority change; current protected ancestry, exact-head gates pending. |
| Orchestrator/free consumer | PR #535 exact `a6fc483fe9537c5881114db82cc9f741eb8331b1` | Noema consumer/privacy/tool boundary only; CO owns provider/model routing/retry/failover; needs post-#526 convergence. |
| Reviewer failed-check evidence | PR #548 exact `e24d31068e1a537b6e7cc4a4ec4ed8d68dca47f0` | Failed-check → actionable source binding and exact positive `Finding.line`; no provider/security authority; needs post-#526 convergence. |
| Shared Kernel | PR #536 exact `82366b27fc985512c91242542d841169e76c347e` | Provider-neutral `noema-core`; contextual-orchestrator remains provider/model owner; needs post-#526 convergence. |
| Workflow concurrency | PR #550 exact `3ed5bd956c84e6dd2ebe604dc226fea82145ac29` | PR-only supersession cancellation and work-conserving handoff; needs post-#526 convergence. |
| Toolchain/license | PR #540 exact `2eba9d6b1e3365f745dd43bb8e40e87b0f2ead3a` | issue #531 / #540; exact-base lock/toolchain/license delta retained; needs post-#526 convergence. |
| Durable Workflow / Task Execution | issue #541 / PR #542 exact `46439b1095da6a6dfd44067fda1b35fb8938849b` | Atomic claim/checkpoint/recovery/effect invariants and hostile provenance validation; current protected ancestry, fresh exact-head gates pending. |
| Documentation authority | PR #547 | Dedicated cross-lane baseline writer; this revision binds protected #526 truth and the current candidate identities above. |

Fresh exact-head workflow evidence is observation-scoped and must be refetched after each source mutation or restack. No predecessor GREEN transfers. A current PR can be review-clean while still non-authorizing because its exact-head gate is queued, failed, stale, or based on an older protected ancestry.

## DDD and ownership baseline

Noema의 Core Domain은 **Agent Runtime**과 **Workflow / Task Execution**이다. **Tool / Capability Boundary**, **State / Checkpoint**, **Isolation Integration**, **Policy / Approval**, **Observability**, **Recovery**는 명시적 bounded context다. Side-effect authority, execution identity, claim/checkpoint CAS는 최소 transaction boundary에서 유지하고 foreign domain truth와 혼합하지 않는다.

`contextual-orchestrator`는 provider/model discovery, routing, TTC, retry/failover와 provider credentials를 소유한다. Noema LLM consumer는 released gateway contract와 canonical `orchestrator/free` alias만 사용하고 direct provider/group/paid fallback을 두지 않는다. `.github`는 reusable workflow와 organization control-plane source를 소유한다. `quarantine-sandbox-runtime`, Wardnet, EgressWeave/AppGuardrail 계열은 각 isolation/security/outbound truth를 소유한다. Keyverse는 identity backend owner다. `context-graph-contracts`와 Enterprise Architecture 계열은 released/versioned contract만 소비하며 mutable sibling PR head, source copy, cross-service SQL을 runtime truth로 사용하지 않는다.

ADR 0012는 broader runtime-orchestration decision이 아직 넓기 때문에 `Proposed`를 유지한다. 이미 protected인 runtime/context-consumer slice를 Proposed라는 이유로 candidate로 되돌리지 않으며 candidate durable workflow state를 문서만으로 Accepted 처리하지 않는다.

## Commercial and buyer gaps

| Priority | Gap | Buyer/operator impact | Current owner | Authoritative completion evidence | Next executable action |
| --- | --- | --- | --- | --- | --- |
| P0 | Central workflow-source drift watch | Central protected source가 다시 움직였는데 Noema trust pin이 따라가지 못하면 reusable review exchange가 fail closed된다. | protected main / `.github` owner path | current central protected SHA, matching protected consumer pin, exact source lineage | 매 fresh sweep에서 central과 Noema pin을 비교하고, central source identity가 전진하면 좁은 successor trust repair를 즉시 만든다. |
| P0 | Current-main exact-head verification | predecessor GREEN을 전용하면 stale source가 merge authority로 승격될 수 있다. | affected open PRs | unchanged exact-head CI/reviewer/Security/image, current review/thread authority, normal merge | current ancestry의 #543/#553/#542 exact-head gates를 검증하면서 #535/#536/#540/#548/#550을 overlap-aware ordinary/non-force convergence하고 각 새 head를 다시 검증한다. |
| P0 | Atomic durable workflow authority | 중복 side effect, checkpoint divergence, cancellation/recovery 오판이나 retained provenance 변조는 buyer runtime 신뢰성을 직접 훼손한다. | issue #541 / #542 | claim/checkpoint/recovery/effect invariants, payload minimization, native/legacy root semantics, isolated malformed-receipt coverage, exact-head GREEN, protected merge | #542 exact `46439b1...`의 fresh CI/reviewer/Security/image를 검증하고 unchanged head에서 모두 GREEN이면 normal protected integration한다. |
| P0 | GPL-family development/build path | 조직의 commercial inbound policy와 build toolchain이 충돌하면 distribution diligence가 fail closed된다. | issue #531 / #540 | current-base lock policy, deterministic lockfile, license/security/image/SBOM/provenance gates, protected merge | #550과 겹치는 workflow delta를 보존하면서 #540을 새 protected ancestry에 수렴시키고 fresh exact-head gates를 검증한다. |
| P0 | Reviewer/Maintainer production identity | source-only readiness로는 독립 review와 bounded publication authority를 입증할 수 없다. | issues #29 / #227 | live installation/permissions/key custody/rotation and bounded publication/recovery receipts | authorized external App provisioning과 protected-source preflight를 실제 control plane에서 수행한다. |
| P0 | Governance enforceability | required workflow 하나만으로 PR approval, history rewrite, deletion, break-glass 통제를 증명할 수 없다. | issue #27 / organization control plane | live ruleset/protection evidence and required workflow behavior | current protected main 기준 read-only governance audit을 재실행하고 미구성 controls는 authorized owner path에서 검증한다. |
| P1 | Patch-validator publication | PR-head image GREEN은 protected operational publication·signing·activation 증거가 아니다. | issue #66 | protected-source registry digest, signature/attestation, operational receipt and rollback | protected-main dispatch와 immutable publication identity가 가능한 owner control plane에서 운영 증거를 생성한다. |
| P1 | Authentic operating evidence | fixture와 repository checks로 30일 production KPI, customer/revenue, legal transfer truth를 만들 수 없다. | issue #3 / issue #5 | production-origin KPI, customer/revenue/legal transfer authority with integrity binding | governed immutable deployment 뒤 authenticated production evidence window와 transfer evidence를 수집·검증한다. |

## Completion discipline

Workflow가 exact head를 checkout한 뒤 실패하면 code/config/log RCA를 수행한다. Runner를 얻지 못한 queued 상태는 control-plane evidence일 뿐이다. Queue를 줄이기 위한 source churn, `paths-ignore`, runner-selector 우회, self-approval, force push/destructive rebase, required-gate weakening은 완료 수단이 아니다.

Noema source의 Apache-2.0 grant, third-party license compatibility, package/artifact distribution rights, release/deployment, KPI, customer/revenue, legal/IP transfer evidence는 서로 별도 권위다. 문서, scanner, SBOM, successful CI 또는 model judgement가 빠진 권위 클래스를 만들어내지 않는다.
