# Noema Product and Technical Gap Baseline

## Authority and update rule

이 문서는 제품 요구, protected 구현, active candidate, 검증, 운영 증거 사이의 현재 차이를 추적한다. 저장소 파일과 테스트는 해당 revision의 구현만 증명하며 PR 상태는 exact head와 independently resolved live base에서 다시 확인한다. 운영·배포·고객·매출·법적 증거는 해당 외부 권한이 실제로 남긴 증거만 인정한다. 문서, 성공 boolean, predecessor run, model judgement로 이후 단계의 권위를 만들지 않는다.

Protected-source snapshot은 `main@e1ac9d50f6c646f04be8c137c8acdc7200182fcd`이다. #528 runtime bounded-context foundation, #530 Apache-2.0 source grant, #537 GitHub installation-token stateless-format regression은 protected truth다. Active PR 구현과 transient workflow 상태는 candidate/observation이며 protected truth로 승격하지 않는다.

## Live observation — 2026-09-05 KST

| Authority | Observation | Consequence |
| --- | --- | --- |
| Protected source | `main@e1ac9d50f6c646f04be8c137c8acdc7200182fcd` | Agent Runtime lifecycle, checkpoint admission, bounded task-plan admission/runnable selection은 protected foundation이다. Durable atomic claim/checkpoint persistence는 별도 후속 candidate다. |
| Third-party/tooling licensing | issue #531 / PR #540 exact `cfe98c8a5bddfd3275b97b7c2a0372f71aadd55f` | GPL-family 개발·빌드 경로 제거 candidate는 regenerated lockfile/policy와 application CI, reviewer-ci, Security Scan, image terminal success까지 도달했다. reviewer success는 #546 protected integration 이전 semantic contract에서 생성돼 merge-authoritative semantic GREEN으로 승계하지 않는다. |
| Durable workflow authority | issue #541 / PR #542 | atomic task claim, checkpoint CAS, effect-start/recovery persistence candidate가 Draft다. protected pure selector는 durable execution authority를 대신하지 않는다. |
| Reviewer semantic evidence | PR #546 exact `a785cd4e536b84cd4bf7e4d6a0e1b9aff71d057f` | Complete 80-file context, fail-before-execution admission, exact Git path/physical-checkout provenance와 complete symbol recovery를 유지한다. Filename prompt injection을 막기 위해 canonical JSON data로 바꾼 `d439058f...`가 legacy whitespace parser와 어긋나 empty-result `node → explore` recovery를 끊은 결함을 RED `1dbe0780...` → production `a785cd4e...`로 닫았다. Canonical JSON serialization·bounded complete scope·physical current-head regular-file 검증을 통과한 경우에만 recovery한다. Exact-head CI/reviewer/Security/image는 non-terminal이다. |
| Stacked reviewer consumers | PR #533 exact `efcebebb2c52d92d131e76285ac26cab74804c53`; PR #548 exact `7e2522ef51e3747a5abc74cd49246e3b7abc24a2` | 두 lane은 #546 `a785cd4e...`를 ordinary two-parent/non-force ancestry로 승계한다. #533은 runner-assignment/acquisition delta만 유지하며 65 ahead / 0 behind다. #548은 richer failed-check/actionability adapter를 보존하면서 JSON prompt-data boundary를 semantic merge했고 79 ahead / 0 behind다. 두 merge-base는 exact #546이다. Current workflows는 non-terminal이고 required Security Scan은 stacked exact heads에 아직 materialize되지 않았다. |
| Context Fabric consumer boundary | PR #544 | Noema는 immutable released Context Graph contract와 authenticated source-bound attestation만 소비한다. Mutable producer PR/source copy/cross-service SQL은 authority가 아니다. |
| Central workflow trust source | `.github/main@3f88e13af9dcde4b9da6958c02a78ce3b5c85800`; PR #527 exact `51e6da8ec1c48e75654023f70ff25360134795ab` | OIDC `job_workflow_sha`는 complete protected central source commit과 exact equality를 요구한다. `f2506388...` 이후 2-commit delta는 central CodeQL/OpenCode/scheduler workflow와 contract tests에 국한됐고 `noema-review.yml` blob `21ea9672...`, `noema_review_gate.py` `5ab7e830...`, `security-scan.yml` `500e22b4...`는 동일하다. #527은 RED `21202074...` → production `51e6da8e...`로 exact source pin을 갱신했다. |
| Automation threat-model accuracy | PR #553 exact `107a973ff4e8ea081e4db843f2de05b530c74f3f` | Protected publisher가 이미 구현한 expected-absence branch lease, exact-head cleanup, unique PR recovery를 “미구현”으로 표시하던 documentation false-negative를 RED `2814e5ee...` → docs repair `107a973f...`로 바로잡았다. Runtime control 자체는 protected truth이고 #553은 문서 정확성 candidate다. |
| Release/publication | repository release collection empty at last fresh observation | Immutable Noema release, package/image publication, release provenance와 rollback evidence는 아직 없다. |

## Current baseline

| Requirement family | Canonical boundary | Protected or active surface | Residual evidence | Maturity |
| --- | --- | --- | --- | --- |
| Credential exchange/readiness | Worker trust contract, OIDC/replay/rate-limit | protected runtime entrypoints/modules | protected deployment smoke와 실제 binding/storage operational evidence | Protected source implemented; operations separate |
| GitHub installation-token compatibility | GitHub token은 opaque bounded transport | protected admission + #537 regression | live App exchange/rotation evidence | Protected transport compatibility |
| Reviewer/maintenance control plane | independent identity, exact-head semantic evidence, deterministic fail-closed gates | protected reviewer source + #546 repair | #546 unchanged exact-head terminal GREEN + protected integration; affected heads fresh semantic review; external App activation | Evidence-integrity repair active |
| Agent Runtime | ADR 0012 + Context Map | protected #528 lifecycle foundation | broader runtime composition/recovery slices | Protected foundation |
| Workflow / Task Execution | task-plan admission과 durable authority 분리 | protected task-plan + #542 durable candidate | atomic claim/checkpoint/recovery exact-head GREEN + protected merge | Durable execution candidate |
| State / Checkpoint | monotonic admission, exact replay idempotency, persistence CAS | protected admission + #542 CAS candidate | durable persistence current-head GREEN and merge | Persistence candidate |
| Tool / Capability Boundary | least authority, versioned capabilities, foreign-owner ACL | bounded protected patterns; issue #545 future extension | extension admission/activation/expiry/rollback | Partial |
| Context Fabric consumer | immutable released producer contract only | protected fail-closed boundary + #544 | immutable producer release + authenticated Noema trust anchor | Foreign release prerequisite open |
| contextual-orchestrator consumer | CO owns provider/model discovery/routing/retry/failover/credentials | protected gateway + #535 `orchestrator/free` convergence | #535 exact-head terminal GREEN + protected integration | Routing-alias repair candidate |
| Patch-validator supply chain | exact source/image/receipt, fail-closed vulnerability policy | protected image/runtime/supply-chain implementation | immutable publication/signing/attestation + operational receipt | Source implemented; publication open |
| Source/dependency licensing | Apache-2.0 source grant; third-party terms independent | protected LICENSE + #540 toolchain candidate | protected lockfile/license re-audit and merge | Source grant protected; toolchain replacement candidate |
| Release/deployment | source → SBOM/provenance → immutable publication → deployment/rollback | release/deployment/readiness scripts | immutable release, governed deployment, recovery smoke | Incomplete |
| KPI/customer/acquisition | authentic source/time/buyer/legal authority | KPI/acquisition validators | >=30-day production KPI, customer/revenue, owner/legal transfer evidence | Commercial final gate not-ready |

## Reviewer-evidence convergence

#546 is the canonical owner repair for semantic CodeGraph admission and current-head retrieval provenance. RED `4b96b40bf0f3e0590b1bf99f3879418c009213ff` proved the old JavaScript sandbox could reject a supplementary-plane path inventory that Python admitted because `String.length` counts UTF-16 code units; production `5eee2566d628159113b75741f1914dee824a6545` aligned the sandbox to Unicode code-point counting without expanding the 24,079-character budget.

RED `cfacdba4132af85555e04b54bfb90b306267619d` then proved `DockerCodeGraphRunner` cached one first-explore output across distinct prompts, so a later symbol-seeded retry prompt could receive stale empty evidence instead of executing. Production `4fcacd16450d3fbd5a2eae0922b90aaab94430f3` replaced that session-wide singleton cache with exact-prompt keyed outputs.

RED `fc0585c0fae7353d7b76d5c1364e0b1c00869e70` proved the same production runner still normalized its host bind source with `Path.resolve()` before provenance admission: a symlinked source root or a physical checkout leaf reached through a symlinked ancestor could be redirected to another physical directory before the container boundary saw it. Production `9f93d9932d2c3d000a69caaf36026275077a71be` preserves the absolute caller root and requires exact equality with strict physical resolution before bind-mount admission.

RED `377f23745a1b76565f86d706705baaaacdcc7583` then proved a deterministic liveness defect: `fetch_manifest()` retained only 12 changed-file contents even though CodeGraph's exact semantic scope admitted 80, and strict gating converts that truncation note into a blocker. Production `406c2f99947836a0b690be8ff7eca78bca989ec1` single-sources `MAX_CONTEXT_FILES` to `MAX_CODEGRAPH_CHANGED_SCOPE_FILES=80`; the regression requires complete 13-file context while 81 files still fail closed.

RED `f18b665dbcdc2f2fb0c50ba8335597af8ce0df51` proves a separate least-authority defect: deterministic 81+ file or aggregate-query-budget rejection used to occur only after local CodeGraph `init`/`sync`/`status`, so an input that could never become review evidence still consumed CodeGraph subprocess capability. Production `fed98d07084b0a607727f2c31a79cdf7f6195659` moves exact scope admission ahead of every CodeGraph runner invocation. Admitted scopes keep the same execution contract; rejected scopes perform zero CodeGraph subprocesses.

Filename prompt injection repair `d439058fa9090a7157361c7260b98956fe7cfe65` then encoded changed-file scope as canonical JSON and explicitly marked filenames as untrusted prompt data. Fresh RED `1dbe0780ea60e8f838cdcf246bcc5679d9d43d02` proves that this representation change silently disabled the existing explicit-empty symbol-seeded recovery because `cli.py` still recognized only the legacy whitespace prefix. Production `a785cd4e536b84cd4bf7e4d6a0e1b9aff71d057f` decodes only the canonical JSON suffix, requires exact canonical reserialization, existing file/symbol ceilings and physical current-head regular files, then permits the existing complete `node --symbols-only` recovery. Malformed, noncanonical, partial or redirected scopes remain fail closed.

#533 and #548 are non-force stacked on exact #546. Their exact heads are `efcebebb2c52d92d131e76285ac26cab74804c53` and `7e2522ef51e3747a5abc74cd49246e3b7abc24a2`; fresh compare shows 65/79 ahead, 0 behind with exact #546 merge-base. #548's own richer `github_io.py` received the JSON prompt-data repair semantically rather than being overwritten by #546. Their current workflows are non-terminal and inherit no GREEN authority.

Terminal reviewer successes created before #546 reaches protected truth remain workflow-surface evidence only. This applies to unchanged open heads such as #526, #536, #539, #540 and #543 even where application/Security/image are terminal success. Source churn merely to retrigger review, predecessor evidence transfer, self-approval, force-push/destructive rebase or gate weakening is not completion.

## Prioritized residual gaps

| Priority | Gap | Buyer/operator impact | Current owner | Authoritative completion evidence | Next executable action |
| --- | --- | --- | --- | --- | --- |
| P0 | Reviewer semantic/provenance false-green or self-block | False approval can let incomplete or redirected source evidence cross the commercial merge boundary; deterministic self-block or broken recovery can also make valid changed-source evidence unavailable. | PR #546 | unchanged exact-head CI/reviewer/Security/image/SBOM/vulnerability/provenance terminal clean + zero findings + protected merge; then fresh affected-head reviewer evidence | verify #546 exact `a785cd4e...`; RCA any terminal failure |
| P0 | Atomic durable workflow execution authority | Duplicate claims/effects or ambiguous recovery can corrupt long-running buyer workflows and audit trails. | issue #541 / PR #542 | atomic single-winner claim, checkpoint CAS, effect-start/recovery/cancellation tests + exact-head gates + protected merge | verify #542 repaired head without gate weakening |
| P0 | GPL-family development/build dependency path | Unresolved toolchain licensing can block enterprise procurement, redistribution review and clean SBOM acceptance. | issue #531 / PR #540 | regenerated lockfile free of prohibited path + application/security/dev/deploy/license inventory + protected merge | after #546 protected integration, regenerate semantic review for unchanged #540 |
| P0 | Maintainer/Reviewer App activation | Without live bounded App identities, review/publication cannot be proved as least-privilege production operations. | issues #29 / #227 | live installation/permissions/key custody/rotation + bounded publication/rollback receipt | owner provision then protected preflight/canary |
| P0 | Protected `main` governance target | Missing or misapplied repository governance can bypass the evidence chain even when source gates are correct. | issue #27 | fresh ruleset/protection + behavioral proof | authorized control-plane verification/repair |
| P1 | Context Graph immutable producer contract | Mutable producer evidence can couple Noema to unversioned semantic truth and break reproducible integrations. | PR #544 + producer owner | immutable package/SBOM/provenance/source-manifest/attestation/conformance/admission evidence | fail closed until producer release; verify #544 candidate |
| P1 | Patch-validator publication proof | Source-only validator hardening does not prove the shipped image is the reviewed immutable artifact. | issue #66 | protected workflow receipt, immutable digest, signature/attestation, activation/rollback proof | owner-controlled publication path |
| P1 | Authentic >=30-day KPI | Buyers cannot rely on synthetic or short-window readiness claims for production reliability and service quality. | issue #3 | production-origin integrity/provenance-bound KPI | governed collector/verifier |
| P1 | Immutable release/deployment/acquisition evidence | A merged repository without release, rollback and commercial evidence is not a transferable production product. | issue #5 | immutable release + governed deployment + customer/revenue/support/rights/transfer evidence | complete preceding evidence families then re-audit |

## Documentation authority reconciliation

Protected `main@e1ac9d50f6c646f04be8c137c8acdc7200182fcd` already contains #528, #530 and #537. Current candidate/observation authority is #546 `a785cd4e...`, stacked #533 `efcebebb...` / #548 `7e2522ef...`, #540 workflow observation, central `.github/main@3f88e13a...`, #527 `51e6da8e...`, #553 `107a973f...`, and the most recently observed empty release collection. ADR 0012 remains `Proposed`; protected implementation status does not imply ADR lifecycle acceptance.

## Completion discipline

A gap closes only when its authoritative completion evidence exists and is bound to the current exact source/head. Queued/skipped/cancelled/stale checks, predecessor results, documentation existence, synthetic fixtures, model judgement and mutable sibling source are not completion evidence. A waiting lane does not block other safe Noema-owned repairs. Source license, package/artifact license metadata, third-party terms, immutable publication, deployment and commercial/legal authority remain separate evidence classes.