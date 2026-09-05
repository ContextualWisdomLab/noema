# Noema Product and Technical Gap Baseline

## Authority and update rule

이 문서는 protected 구현, active candidate, transient workflow observation, foreign-owner authority를 구분해 Noema의 제품·기술 Gap을 추적한다. 저장소 파일과 테스트는 해당 revision의 source contract만 증명한다. PR, check, release, central workflow source는 매 판단 시 live exact head에서 다시 읽으며 predecessor GREEN, 문서 존재, model judgement, synthetic fixture를 이후 단계의 권위로 전용하지 않는다.

Protected-source snapshot은 `main@e1ac9d50f6c646f04be8c137c8acdc7200182fcd`이다. #528 runtime bounded-context foundation, #530 Apache-2.0 source grant, #537 GitHub installation-token stateless-format regression은 protected truth다. ADR 0012는 여전히 `Proposed`이며 protected 구현의 존재가 ADR lifecycle acceptance를 뜻하지 않는다.

## Live observation — 2026-09-06 KST

| Authority | Exact observation | Consequence |
| --- | --- | --- |
| Protected Noema | `main@e1ac9d50f6c646f04be8c137c8acdc7200182fcd` | Agent Runtime lifecycle, task-plan admission, checkpoint admission은 protected foundation이다. Durable atomic execution authority는 별도 candidate다. |
| Reviewer semantic evidence | #546 exact `7d3de5a859be96b953927201d9ba782673f4bb8e` | Predecessor `95144d5b...`의 hosted `reviewer-ci 33986014642` / job `101359520394`은 exact checkout과 hash-pinned install 뒤 100% line+branch pytest gate까지 통과했다. 실패는 새 nested `semantic_runner`의 누락 docstring 하나 때문에 100% docstring gate에서 발생했다. `7d3de5a...`는 해당 behavioral docstring만 추가한 최소 수리다. 새 exact-head CI/reviewer/Security/image는 queued/non-passing이며 predecessor 성공은 전용하지 않는다. |
| Stacked reviewer consumers | #533 exact `a8191597bbe0f80183b4df8bbf536f40c8129dc8`; #548 exact `d3b42ac0f0a889ddfec25f2d0549df9db4e888dd` | 둘 다 exact #546 `7d3de5a...`를 ordinary two-parent/non-force ancestry로 승계한다. #533은 19-file runner/acquisition delta, 70 ahead / 0 behind다. #548은 16-file failed-check/actionability delta, 86 ahead / 0 behind다. 두 merge-base는 exact #546이다. |
| Commercial-loop concurrency | #550 exact `d23a055abd08e8df2c6b0ab193beb1f731196f5b` | Predecessor `a545af02...`의 real hosted CI `33986513999` / job `101360961505`는 exact checkout, live-base/lockfile/install/typecheck 뒤 release tests에서 552 files와 3,924 tests를 통과했고, 남은 8 failures가 모두 stale commercial-readiness test authority에 국한됨을 확정했다. `d23a055...`는 production/workflow를 건드리지 않고 canonical decision owner, complete check-suite identity, stale-review parsing, ESM-safe child-process mock, owner-only delegated-token/report-0600 regression으로 test harness만 수리했다. Exact-head four workflows는 queued/pending이다. |
| Third-party/tooling licensing | #540 exact `cfe98c8a5bddfd3275b97b7c2a0372f71aadd55f` | Wrangler/Miniflare→Libvips GPL-family 개발 경로를 pinned workerd+esbuild와 bounded Cloudflare adapter로 대체한 candidate다. Exact workflow surfaces는 success였지만 reviewer는 protected #546 이전 계약에서 생성됐으므로 semantic GREEN으로 승계하지 않는다. |
| Durable workflow authority | issue #541 / #542 exact `74a9493741676753d91ee2f8a52d25beaff1c280` | Predecessor `037ec4e2...`의 hosted CI `33988947150` / job `101367573270`은 exact checkout/live-base/lockfile/install/typecheck 뒤 **569 files / 4,043 tests를 전부 통과**했지만 required coverage가 statements `99.87%`, branches `99.82%`, functions/lines `100%`에서 실패했다. 남은 구멍은 execution-plan authority는 존재하지만 workflow state record가 없는 각 public operation의 fail-closed branch와 private Durable Object의 storage-unavailable→503 mapping이었다. Test-only `74a9493...`가 state record만 제거한 real repository fixture와 DO storage-outage fixture로 해당 경계를 고정한다. Production, threshold, `v8 ignore`, runner/provider/security/outbound authority는 바꾸지 않았다. |
| Context Fabric boundary | #544 exact `d5ecf8331d78db1e5d1b5505e818a1f8aed01076` | Noema는 immutable released Context Graph contract와 authenticated source-bound attestation만 소비한다. Mutable producer PR/source copy/cross-service SQL은 권위가 아니다. |
| Central workflow trust | `.github/main@d9eb9f79b6ce66c1225c26be385ae814d87d9aca`; #527 exact `d27262df5c037f68c2a8db8894cd48f35ef55e24` | Central #1943은 canonical review sidecar에서 orchestrator per-attempt stderr trace를 기록하는 owner-side change다. Noema trust-bearing central blobs `noema-review.yml`, `noema_review_gate.py`, `security-scan.yml`은 이전 source와 byte-identical이지만 OIDC `job_workflow_sha`는 complete protected central commit을 인증한다. RED `44ffbdee...` → production `d27262df...`가 `ALLOWED_WORKFLOW_SHA`만 새 source로 이동한다. Provider/retry/logging policy는 central/contextual-orchestrator owner에 남는다. |
| Central runner/control plane | `.github#712` | Hosted runner가 #546, #550, #542 predecessor를 실제 실행한 증거가 있으므로 capacity 자체가 상시 부재한 것은 아니다. Current exact heads의 queued/pending evidence는 predecessor result로 대체하지 않는다. Leaf `runs-on` 변경, no-op source churn, rerun storm, gate suppression은 대안이 아니다. |
| Central CO sidecar migration | `.github#1759` open | Strix/OpenCode/Noema/autofix central consumers의 `orchestrator-free-sidecar` migration은 `.github` owner path다. Noema는 provider key/routing authority를 복제하지 않는다. |
| Automation threat-model docs | #553 exact `107a973ff4e8ea081e4db843f2de05b530c74f3f` | Protected publisher의 expected-absence lease, exact-head cleanup, unique PR recovery를 미구현으로 적은 stale docs를 바로잡는 candidate다. |
| Cross-session docs | #552 exact `5e49c9af86cc63cd00e4f64fc6298a85c9594b7d` | Existing workflow surfaces는 success지만 reviewer가 protected #546 이전이다. Source churn 없이 Draft를 유지한다. |
| Release/publication | repository release collection은 fresh 2026-09-06 read에서 비어 있다 | Immutable version/tag/package/image/SBOM/provenance/reproducibility/rollback receipt가 없으므로 source readiness를 release readiness로 승격하지 않는다. |

## DDD and ownership baseline

Noema의 canonical Core Domain은 Agent Runtime과 Workflow/Task Execution이다. State/Checkpoint, Tool Capability, Isolation Integration, Policy/Approval, Observability, Recovery는 그 lifecycle을 보조하는 bounded context다. Aggregate와 invariant는 최소 transaction boundary에서 유지하며 durable effect ownership을 외부 서비스의 domain truth와 섞지 않는다.

Context Map의 외부 관계는 ACL/consumer 형태가 기본이다. `contextual-orchestrator`는 LLM provider/model discovery, routing, retry/failover와 credential authority를 소유한다. `quarantine-sandbox-runtime`, Wardnet, EgressWeave는 격리·보안·outbound authority를 소유한다. Keyverse는 identity backend owner다. Context Fabric 계열은 released/versioned contract만 소비한다. Noema는 이 owner들의 source를 복사하거나 cross-service SQL, mutable sibling PR head를 runtime truth로 사용하지 않는다.

## Reviewer-evidence convergence

#546은 semantic CodeGraph admission과 current-head retrieval provenance의 canonical repair lane이다. 유지해야 할 causal lineage는 다음과 같다.

- complete manifest context: RED `377f2374...` → `406c2f99...`, 80-file canonical scope와 manifest context를 일치시킨다.
- fail-before-execution admission: RED `f18b665d...` → `fed98d07...`, deterministic over-budget input은 CodeGraph subprocess capability를 소비하지 않는다.
- initial prompt filename isolation: `d439058f...`, canonical JSON data로 이동한다.
- JSON-scope recovery restoration: RED `1dbe0780...` → `a785cd4e...`, malformed/noncanonical/partial/redirected scope는 fail closed한다.
- recovery prompt injection closure: RED `244a0294...` → `b6c37025...`, second explore의 path와 symbol map도 canonical JSON untrusted data로 유지한다.
- Linux exact Git-path identity: RED `3328f7ba...` → `04376e27...`, leading backslash를 Linux filename byte로 보존하면서 POSIX traversal/absolute-path rejection을 유지한다.
- hosted test/coverage convergence: `04376e27...`의 real runner RED는 stale deterministic finding dedup fixture와 99.29% coverage holes를 증명했다. `b84f0e5a...`, `6e5df50c...`, `95144d5b...`가 exact-identity fixture, fail-closed edge coverage, unreachable branch를 각각 수리했다.
- hosted docstring convergence: `95144d5b...`의 real runner는 line+branch pytest 100%를 통과한 뒤 nested `semantic_runner` docstring 누락으로 docstring gate에서 RED가 됐다. `7d3de5a...`는 runtime 변경 없이 그 계약만 보완한다.

#533과 #548은 exact #546 `7d3de5a...`를 non-force로 승계한다. #548은 failed-check causal binding, repository-bound Actions Job mapping, annotation fallback, structured actionability, inline suggestion과 richer Finding schema를 자체 소유하므로 #546-owned files를 wholesale overwrite하지 않는다.

Terminal reviewer successes가 #546 protected integration 전에 생성된 open PR은 workflow-surface evidence일 뿐 merge-authoritative semantic GREEN이 아니다. Source churn으로 reviewer를 억지 재실행하거나 predecessor verdict를 전용하지 않는다.

## Commercial-loop test authority

#550은 open-PR lane이 대기 중이어도 서로 다른 path의 buyer gap을 계속 처리하는 work-conserving scheduler/publisher boundary를 소유한다. `a545af02...`의 hosted CI가 보여 준 8 failures는 production concurrency/path-isolation 자체가 아니라 refactor 후 남은 test authority drift였다. Check-run identity fixture는 current `check_suite.id` fail-closed contract를 생략했고, decision tests는 이미 `scripts/lib/commercial-readiness-loop.mjs`로 이동한 canonical evaluator 대신 retired snapshot field/action을 사용했으며, ESM module namespace를 `vi.spyOn`으로 재정의하려 했다.

Test-only `d23a055...`는 canonical `evaluatePullRequest`/`REQUIRED_CHECK_NAMES`를 직접 사용하고, current repository/base/head/check/reviewer/thread semantics에 맞춘다. Stale approval은 `parseNoemaReviewDecision`으로 current-head authority가 되지 않음을 보존한다. `main()` regression은 hoisted child-process mock과 owner-only delegated token capability를 사용하고 generated report mode `0600`을 검증한다. Production workflow, path-isolation rule, credential boundary, model/provider routing, timeout semantics, coverage/gate는 변경하지 않는다.

## Durable workflow transport boundary

#542의 private `NOEMA_WORKFLOW_STATE` adapter는 Workflow/Task Execution과 State/Checkpoint authority를 Durable Object serialization point에 결합하지만 arbitrary caller object 전체를 transport할 권위는 갖지 않는다. TypeScript structural typing은 runtime exact-object 보장을 제공하지 않는다.

RED `19c6fa2e...` → `10708af3...`는 top-level object spread를 operation-indexed allowlist로 바꿨다. RED `00e871e1...` → `1f7f5b91...`는 `command.operation`을 한 번 snapshot해 serialized discriminator와 payload-field selection이 갈라지지 않도록 했다.

그 뒤 nested structural object 자체가 wholesale serialization되는 경계를 확인했다. RED `e88a3796...`는 valid claim 안 extra field/getter를, `81abbab5...`는 checkpoint의 동일 문제를 고정한다. `f915d136...`는 malformed non-record nested authority를 거짓-valid object로 정규화하지 않고 Durable Object의 fail-closed validator에 남긴다. Production `037ec4e2...`는 claim을 `executionId/planId/taskId/claimId/attempt/effect`, checkpoint 계열을 `executionId/sequence/stateDigest`로 projection한다. Semantic validation과 durable state authority는 계속 `NoemaWorkflowState`가 소유한다.

Exact `037ec4e2...`의 hosted CI는 application tests 자체는 모두 통과했지만 execution-plan authority가 남고 state record만 사라진 fail-closed branches와 DO storage-unavailable classification이 coverage에서 빠졌음을 입증했다. `74a9493...`는 production을 건드리지 않고 그 two-condition state fixture를 만들고, `read`, both claim paths, effect start, cancellation, completion, recovery, blocked resolution, checkpoint CAS가 모두 `WorkflowStateConflictError`로 닫히는지 실행한다. 별도 storage-outage fixture는 private adapter가 `WorkflowStateStoreUnavailableError`를 503 `storage_unavailable`로 유지하는지 검증한다. 이 exact head의 fresh gates가 terminal GREEN이 되기 전에는 predecessor 4,043-test 성공도 merge authority로 전용하지 않는다.

## Prioritized commercial gaps

| Priority | Gap | Buyer/operator impact | Current owner | Completion evidence |
| --- | --- | --- | --- | --- |
| P0 | Reviewer semantic/provenance false-green | Redirected, partial, stale, prompt-injected 또는 under-documented evidence가 commercial merge boundary를 통과할 수 있다. | #546 | unchanged exact-head terminal CI/reviewer/Security/image/SBOM/vulnerability/provenance + zero valid findings + protected merge; then affected heads fresh review |
| P0 | Atomic durable workflow authority | Duplicate claim/effect, ambiguous recovery 또는 over-broad private transport가 long-running workflow/audit boundary를 훼손할 수 있다. | issue #541 / #542 | single-winner claim, checkpoint CAS, effect-start/recovery/cancellation + top-level/nested payload-minimization + missing-state/storage-outage fail-closed regressions + exact-head gates + protected merge |
| P0 | GPL-family development/build path | Procurement, redistribution review, clean SBOM acceptance를 막을 수 있다. | issue #531 / #540 | regenerated lockfile/policy + protected integration + post-#546 semantic review |
| P0 | Reviewer/Maintainer App activation | Least-privilege production publication identity를 운영 증거로 입증할 수 없다. | issues #29 / #227 | live installation/permissions/key custody/rotation + bounded publication/rollback receipt |
| P0 | Protected governance target | Source gate가 맞아도 repository governance가 우회되면 evidence chain이 깨진다. | issue #27 | fresh ruleset/protection + behavioral proof |
| P1 | Work-conserving commercial loop | Automation parse/concurrency regression은 open-PR repair와 buyer-gap dispatch를 동시에 정지시킬 수 있다. | #550 | exact-head terminal CI/reviewer/Security/image + concurrency/path-isolation regressions + protected integration |
| P1 | Immutable Context Graph producer contract | Mutable producer evidence는 reproducibility와 consumer isolation을 훼손한다. | #544 + producer owner | immutable package/SBOM/provenance/source-manifest/attestation/conformance evidence |
| P1 | Patch-validator publication | Reviewed source와 shipped image의 동일성이 증명되지 않는다. | issue #66 | immutable digest, signature/attestation, activation/rollback receipt |
| P1 | Authentic production KPI | Synthetic/short-window metrics로 enterprise reliability를 주장할 수 없다. | issue #3 | >=30-day production-origin provenance-bound KPI |
| P1 | Release/deployment/acquisition evidence | merged source만으로 transferable commercial product가 되지 않는다. | issue #5 | immutable release + governed deployment + rollback + customer/revenue/support/rights evidence |

## Performance, test and release gate

Applicable buyer-facing web/API path는 async+k6/E2E로 현실 workload에서 p95 ≤20 ms를 증명해야 하며 초과 시 profile 후 hot path를 수리한다. Sample 축소, 측정 제외, 비현실 cache warm-up으로 gate를 통과시키지 않는다. Owned production docstring/rustdoc, test, edge-case coverage는 각각 100%를 유지한다. Security/performance/math core에 새 hot path가 생기면 Rust-first 원칙과 CPU multithreading, 필요한 GPU parity를 검토한다.

Release는 protected exact head에서만 version/CHANGELOG/tag/package/image/SBOM/provenance/reproducibility/rollback을 하나의 immutable evidence chain으로 만든다. 현재 active prerequisite가 Draft/non-terminal인 동안 release collection의 부재를 source change로 위장하지 않는다.

## Completion discipline

Gap은 authoritative completion evidence가 current exact source/head에 결합될 때만 닫는다. Queued/skipped/cancelled/stale checks, predecessor results, documentation existence, synthetic fixtures, model judgement, mutable sibling source는 completion evidence가 아니다. Waiting lane은 다른 안전한 Noema-owned repair를 막지 않는다. 외부 permission/legal/security/product 결정만 실제 blocker로 남긴다.
