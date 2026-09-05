# Noema Product and Technical Gap Baseline

## Authority and update rule

이 문서는 protected 구현, active candidate, transient workflow observation, foreign-owner authority를 구분해 Noema의 제품·기술 Gap을 추적한다. 저장소 파일과 테스트는 해당 revision의 source contract만 증명한다. PR, check, release, central workflow source는 매 판단 시 live exact head에서 다시 읽으며 predecessor GREEN, 문서 존재, model judgement, synthetic fixture를 이후 단계의 권위로 전용하지 않는다.

Protected-source snapshot은 `main@e1ac9d50f6c646f04be8c137c8acdc7200182fcd`이다. #528 runtime bounded-context foundation, #530 Apache-2.0 source grant, #537 GitHub installation-token stateless-format regression은 protected truth다. ADR 0012는 여전히 `Proposed`이며 protected 구현의 존재가 ADR lifecycle acceptance를 뜻하지 않는다.

## Live observation — 2026-09-06 KST

| Authority | Exact observation | Consequence |
| --- | --- | --- |
| Protected Noema | `main@e1ac9d50f6c646f04be8c137c8acdc7200182fcd` | Agent Runtime lifecycle, task-plan admission, checkpoint admission은 protected foundation이다. Durable atomic execution authority는 별도 candidate다. |
| Reviewer semantic evidence | #546 exact `04376e279c61a7491cb311589b28dc643bf65837` | Retained JSON-safe recovery `b6c37025...`에 이어 RED `3328f7ba...` → production `04376e27...`가 Linux sandbox에서 leading-backslash Git filename을 Windows absolute path로 오인하던 cross-boundary identity defect를 제거했다. POSIX absolute/traversal/NUL/bound checks와 no-symlink copy boundary는 그대로다. Exact-head CI/reviewer/Security/image는 non-terminal이다. |
| Stacked reviewer consumers | #533 exact `52b9195bb9f5006ffcd2dca7dedbf05c51169239`; #548 exact `dd7353342b4776b007b74f8b223e172dcb3d4f4f` | 둘 다 exact #546을 ordinary two-parent/non-force ancestry로 승계한다. #533은 19-file runner/acquisition delta, 68 ahead / 0 behind다. #548은 16-file failed-check/actionability delta, 83 ahead / 0 behind이며 richer README/github adapter를 보존한다. 두 merge-base는 exact #546이다. |
| Third-party/tooling licensing | #540 exact `cfe98c8a5bddfd3275b97b7c2a0372f71aadd55f` | regenerated lockfile/policy와 workflow-surface success가 있으나 reviewer는 protected #546 이전 계약에서 생성됐다. Semantic GREEN으로 승계하지 않는다. |
| Durable workflow authority | issue #541 / #542 exact `10708af37b69897a44aefa5e8e4027e0340e3e90` | atomic claim, checkpoint CAS, effect-start/recovery persistence candidate가 Draft다. Hosted predecessor는 4,035 tests 통과 후 100% coverage gate에서 실패했고 failure/authority coverage를 보강했다. Fresh RED `19c6fa2e...` → production `10708af3...`는 structurally compatible caller의 extra enumerable field가 private Durable Object command transport로 평가·직렬화되던 payload-minimization 결함을 operation-specific allowlist로 닫았다. Exact-head CI/reviewer/Security/image는 아직 non-terminal이다. |
| Context Fabric boundary | #544 | Noema는 immutable released Context Graph contract와 authenticated source-bound attestation만 소비한다. Mutable producer PR/source copy/cross-service SQL은 권위가 아니다. |
| Central workflow trust | `.github/main@f2f91b806122ed233e3a0e2a325246077c2e15e4`; #527 exact `f7b8bde5b79806d87cf036d77a2046cac3884706` | Central #1939는 review-sidecar free-route catalog를 동일 cost/ZDR tier 안에서 account round-robin으로 채우는 owner-side change다. Noema trust-bearing `noema-review.yml`, `noema_review_gate.py`, `security-scan.yml` blobs는 직전 source와 byte-identical이지만 OIDC `job_workflow_sha`는 complete protected central commit을 인증하므로 RED `b26ffa7b...` → production `f7b8bde5...`로 canonical `ALLOWED_WORKFLOW_SHA`를 exact source에 재결합했다. Provider/catalog policy는 central owner에 남는다. |
| Central runner/control plane | `.github#712` | Current #546 및 #542/#527 exact heads에 queued/pending workflow surfaces가 새로 materialize됐다. No predecessor result is transferred. Leaf `runs-on` 변경이나 no-op rerun은 대안이 아니다. |
| Central CO sidecar migration | `.github#1759` open | Strix/OpenCode/Noema/autofix central consumers의 `orchestrator-free-sidecar` migration은 `.github` owner path다. Noema는 provider key/routing authority를 복제하지 않는다. |
| Automation threat-model docs | #553 exact `107a973ff4e8ea081e4db843f2de05b530c74f3f` | Protected publisher의 expected-absence lease, exact-head cleanup, unique PR recovery를 미구현으로 적은 stale docs를 바로잡는 candidate다. |
| Cross-session docs | #552 exact `5e49c9af86cc63cd00e4f64fc6298a85c9594b7d` | Earlier CI/Security/image/reviewer surfaces는 success지만 reviewer가 protected #546 이전이다. Source churn 없이 Draft로 되돌려 Ready false-green을 제거했다. |
| Release/publication | repository release collection is empty on the fresh 2026-09-06 read | Immutable version/tag/package/image/SBOM/provenance/reproducibility/rollback receipt가 없으므로 source readiness를 release readiness로 승격하지 않는다. |

## DDD and ownership baseline

Noema의 canonical Core Domain은 Agent Runtime과 Workflow/Task Execution이다. State/Checkpoint, Tool Capability, Isolation Integration, Policy/Approval, Observability, Recovery는 그 lifecycle을 보조하는 bounded context다. Aggregate와 invariant는 최소 transaction boundary에서 유지하며 durable effect ownership을 외부 서비스의 domain truth와 섞지 않는다.

Context Map의 외부 관계는 ACL/consumer 형태가 기본이다. `contextual-orchestrator`는 LLM provider/model discovery, routing, retry/failover와 credential authority를 소유한다. `quarantine-sandbox-runtime`, Wardnet, EgressWeave는 격리·보안·outbound authority를 소유한다. Keyverse는 identity backend owner다. Context Fabric 계열은 released/versioned contract만 소비한다. Noema는 이 owner들의 source를 복사하거나 cross-service SQL, mutable sibling PR head를 runtime truth로 사용하지 않는다.

## Reviewer-evidence convergence

#546은 semantic CodeGraph admission과 current-head retrieval provenance의 canonical repair lane이다. 현재까지 유지해야 할 causal lineage는 다음과 같다.

- Unicode path-budget parity: RED `4b96b40b...` → `5eee2566...`.
- prompt-specific CodeGraph result identity: RED `cfacdba4...` → `4fcacd16...`.
- physical checkout/root provenance: RED `fc0585c0...` → `9f93d993...` 및 후속 symlink-boundary repairs.
- complete manifest context: RED `377f2374...` → `406c2f99...`, 80-file canonical scope와 manifest context를 일치시킨다.
- fail-before-execution admission: RED `f18b665d...` → `fed98d07...`, deterministic over-budget input은 CodeGraph subprocess capability를 소비하지 않는다.
- initial prompt filename isolation: `d439058f...`, canonical JSON data로 이동한다.
- JSON-scope recovery restoration: RED `1dbe0780...` → `a785cd4e...`, malformed/noncanonical/partial/redirected scope는 fail closed한다.
- recovery prompt injection closure: RED `244a0294...` → `b6c37025...`, second explore의 path와 symbol map도 canonical JSON untrusted data로 유지한다.
- Linux exact Git-path identity: RED `3328f7ba...` → `04376e27...`, production sandbox가 leading backslash를 Windows separator로 오인하지 않고 Linux filename byte로 보존한다. POSIX slash traversal과 absolute-path rejection은 유지한다.

#533과 #548은 이 exact prerequisite를 non-force로 승계한다. #548은 failed-check causal binding, repository-bound Actions Job mapping, annotation fallback, structured actionability, inline suggestion을 자체 소유하므로 prerequisite 파일을 wholesale overwrite하지 않고 semantic composition을 유지한다.

Terminal reviewer successes가 #546 protected integration 전에 생성된 open PR은 workflow-surface evidence일 뿐 merge-authoritative semantic GREEN이 아니다. Source churn으로 reviewer를 억지 재실행하거나 predecessor verdict를 전용하지 않는다.

## Durable workflow transport boundary

#542의 private `NOEMA_WORKFLOW_STATE` adapter는 Workflow/Task Execution과 State/Checkpoint authority를 Durable Object serialization point에 결합하지만, 그 사실이 arbitrary caller object 전체를 transport할 권위를 주지는 않는다. TypeScript structural typing은 runtime exact-object 보장을 제공하지 않으므로 typed command 변수에도 unrelated enumerable field가 남을 수 있다.

RED `19c6fa2e...`는 valid `read` command에 foreign-domain payload와 access 시 throw하는 ambient getter를 붙여 transport가 command-authority field 외 데이터를 건드리지 않아야 한다는 실행 계약을 추가했다. Production `10708af3...`는 object spread를 제거하고 operation-indexed allowlist만 serialize한다. `operation`, re-admitted `plan`, 해당 command family의 claim/checkpoint/cancellation/outcome field만 경계를 건너며 repository/DO 내부의 재검증은 그대로다. 이 repair는 Noema의 payload minimization과 bounded-context isolation을 강화할 뿐 authentication, provider routing, security/quarantine verdict 또는 outbound authority를 새로 소유하지 않는다.

## Prioritized commercial gaps

| Priority | Gap | Buyer/operator impact | Current owner | Completion evidence |
| --- | --- | --- | --- | --- |
| P0 | Reviewer semantic/provenance false-green | Redirected, partial, stale 또는 prompt-injected evidence가 commercial merge boundary를 통과할 수 있다. | #546 | unchanged exact-head terminal CI/reviewer/Security/image/SBOM/vulnerability/provenance + zero valid findings + protected merge; then affected heads fresh review |
| P0 | Atomic durable workflow authority | Duplicate claim/effect, ambiguous recovery 또는 over-broad private transport가 long-running workflow/audit boundary를 훼손할 수 있다. | issue #541 / #542 | single-winner claim, checkpoint CAS, effect-start/recovery/cancellation + payload-minimization regressions + exact-head gates + protected merge |
| P0 | GPL-family development/build path | Procurement, redistribution review, clean SBOM acceptance를 막을 수 있다. | issue #531 / #540 | regenerated lockfile/policy + protected integration + post-#546 semantic review |
| P0 | Reviewer/Maintainer App activation | Least-privilege production publication identity를 운영 증거로 입증할 수 없다. | issues #29 / #227 | live installation/permissions/key custody/rotation + bounded publication/rollback receipt |
| P0 | Protected governance target | Source gate가 맞아도 repository governance가 우회되면 evidence chain이 깨진다. | issue #27 | fresh ruleset/protection + behavioral proof |
| P1 | Immutable Context Graph producer contract | Mutable producer evidence는 reproducibility와 consumer isolation을 훼손한다. | #544 + producer owner | immutable package/SBOM/provenance/source-manifest/attestation/conformance evidence |
| P1 | Patch-validator publication | Reviewed source와 shipped image의 동일성이 증명되지 않는다. | issue #66 | immutable digest, signature/attestation, activation/rollback receipt |
| P1 | Authentic production KPI | Synthetic/short-window metrics로 enterprise reliability를 주장할 수 없다. | issue #3 | >=30-day production-origin provenance-bound KPI |
| P1 | Release/deployment/acquisition evidence | merged source만으로 transferable commercial product가 되지 않는다. | issue #5 | immutable release + governed deployment + rollback + customer/revenue/support/rights evidence |

## Performance, test and release gate

Applicable buyer-facing web/API path는 async+k6/E2E로 현실 workload에서 p95 ≤20 ms를 증명해야 하며 초과 시 profile 후 hot path를 수리한다. sample 축소, 측정 제외, 비현실 cache warm-up으로 gate를 통과시키지 않는다. Owned production docstring/rustdoc, test, edge-case coverage는 각각 100%를 유지한다. Security/performance/math core에 새 hot path가 생기면 Rust-first 원칙과 CPU multithreading, 필요한 GPU parity를 검토한다.

Release는 protected exact head에서만 version/CHANGELOG/tag/package/image/SBOM/provenance/reproducibility/rollback을 하나의 immutable evidence chain으로 만든다. 현재 active prerequisite가 Draft/non-terminal인 동안 release collection의 부재를 source change로 위장하지 않는다.

## Completion discipline

Gap은 authoritative completion evidence가 current exact source/head에 결합될 때만 닫는다. Queued/skipped/cancelled/stale checks, predecessor results, documentation existence, synthetic fixtures, model judgement, mutable sibling source는 completion evidence가 아니다. Waiting lane은 다른 안전한 Noema-owned repair를 막지 않는다. 외부 permission/legal/security/product 결정만 실제 blocker로 남긴다.
