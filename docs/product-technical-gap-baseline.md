# Noema Product and Technical Gap Baseline

## Authority and update rule

이 문서는 protected 구현, active candidate, transient workflow observation, foreign-owner authority를 구분해 Noema의 제품·기술 Gap을 추적한다. 저장소 파일과 테스트는 해당 revision의 source contract만 증명한다. PR, check, release, central workflow source는 매 판단 시 live exact head에서 다시 읽으며 predecessor GREEN, 문서 존재, model judgement, synthetic fixture를 이후 단계의 권위로 전용하지 않는다.

Protected-source snapshot은 `main@71cd0fb6f3cf6ed1b886c8c312bfe96e7613f155`이다. #528 runtime bounded-context foundation, #530 Apache-2.0 source grant, #537 GitHub installation-token stateless-format regression, #546 semantic reviewer admission repair와 #544 Context Graph release-consumer admission이 protected truth다. ADR 0012는 여전히 `Proposed`이며 protected 구현의 존재가 ADR lifecycle acceptance를 뜻하지 않는다.

## Live observation — 2026-09-06 KST

| Authority | Exact observation | Consequence |
| --- | --- | --- |
| Protected Noema | `main@71cd0fb6f3cf6ed1b886c8c312bfe96e7613f155` | Agent Runtime lifecycle, task-plan/checkpoint admission, #546 semantic reviewer boundary와 #544 source-bound Context Graph admission이 protected truth다. Durable atomic execution authority는 별도 candidate다. |
| Apache-2.0 source grant | protected main | #530의 source grant는 protected truth다. 현재 licensing gap은 source-license 선택이 아니라 issue #531 / PR #540의 third-party build/development path와 transferable release evidence다. |
| Protected semantic reviewer | PR #546 exact `7d3de5a859be96b953927201d9ba782673f4bb8e`, merged in protected history | Exact reviewer, application CI, required Security Scan, patch-validator image가 terminal success이고 valid review threads가 해소된 뒤 정상 merge했다. Empty/partial/stale CodeGraph evidence, prompt-shaped retrieval data, Linux exact Git-path identity와 reviewer coverage/docstring gaps의 causal repairs가 default-branch reviewer source다. |
| Protected Context Fabric consumer | PR #544 exact `35ab2d08bbbbcf8b2d530795b7a0107709712285`, merged as `71cd0fb6f3cf6ed1b886c8c312bfe96e7613f155` | Noema는 immutable released Context Graph contract를 package/SBOM/provenance, exact protected source, source manifest, independent attestation verification과 versioned envelope-preserving admission capability에 결합해 소비한다. Mutable producer PR/source copy/cross-service SQL은 권위가 아니다. |
| Post-#544 descendants | #535 `9dfc433674ff4c2ae857846ac1aae3bae1889e52`; #536 `cf5dfa16958b664d18959b3b712ccbdadc0b76b8`; #527 `25eb862ce496fa4fff413b77d361db01b6228a45`; #533 `8ced86c7636e3e5d09757459150df53e5329541e`; #548 `02ec90068ca0e182da940ab3a14c5d5902dc3f77`; #526 `81ef8b75aaad2083156b415e59fd7f27740a1b02`; #550 `158d818836d88ff7482b652738cd1add8968ccd6`; #542 `6953eaad292ea88d1b50bcb67011b473fb0eeb28`; #539 `299efc83ba3710a4405ae39d59fe517fb3740200`; #543 `6f09d16dca7c696e8816612cd13b963c3640e9a3`; #552 `a0d8e40e0d923f06b8ffa2af51768f21c9eeb24d`; #553 `ec3dbdfe1e521304b3da56af48a9a62605905b20` | #544의 7개 protected path와 각 lane의 branch-owned delta가 겹치지 않는 경우 exact protected blobs를 ordinary two-parent/non-force ancestry로 승계했다. Fresh exact-head gates만 merge authority다. #535/#536은 ancestry는 정리됐지만 각각 누락된 Unreleased release note를 복구해야 한다. |
| Reviewer finding source identity | PR #548 exact `02ec90068ca0e182da940ab3a14c5d5902dc3f77` | `Finding.line`은 GitHub current-head source identity이므로 coercible scalar가 아니다. RED `6551a863...`가 0/음수/bool/float/string line을 거부하도록 요구했고 production `5c204538...` + cleanup `02ec9006...`가 exact positive integer/None만 schema admission에서 허용한다. Current exact-head gates는 재생성 중이며 predecessor GREEN은 전용하지 않는다. |
| Cloudflare toolchain restack | #540 `197fb05d83cf662ecfe8c3fa3fa00929579a5566`, protected main 대비 35 ahead / 0 behind | #544가 package/lockfile bytes를 바꾸지 않았지만 PR base가 이동했으므로 `.github/lockfile-change-policy.json.baseSha`의 `85b17014...`는 stale authority가 됐다. `7224d654...`가 exact base를 `71cd0fb...`로만 rebind하고 `197fb05d...`가 17개 toolchain path를 ordinary/non-force restack했다. Package/top-level digest evidence는 유지하며 fresh exact-head gates만 권위다. |
| Durable workflow authority | issue #541 / PR #542 exact `6953eaad292ea88d1b50bcb67011b473fb0eeb28` | Predecessor hosted CI는 570 files / 4,045 tests, statements/functions/lines 100%, branch 99.98%에서 마지막 unexpected-fault containment arm을 특정했다. Test-only `6793a320...`가 private Durable Object `500 internal_error` fallback을 고정했고 current head는 full delta를 protected #544 위에 non-force restack했다. |
| Central workflow trust | `.github/main@efb8926923de45245338159a489a1b227e81945f`; #527 exact `25eb862ce496fa4fff413b77d361db01b6228a45` | Central protected head advanced one commit from `fe827e...`: the reusable Noema workflow path itself is unchanged, while the central review sidecar pin moved to contextual-orchestrator `414f2297...` with its contract test/ADR/CHANGELOG. Because OIDC `job_workflow_sha` authenticates the complete central source commit, RED `2e38afbb...` → production `25eb862c...` rebinds only Noema `ALLOWED_WORKFLOW_SHA`. Provider/model routing, retry, sanitizer, security/quarantine/outbound policy remain central/contextual-orchestrator owner authority. |
| Central runner/control plane | `.github#712` | Hosted runner는 이전 candidate들을 실제 실행했으며 새 post-#544 heads는 다시 queued/pending 표본을 만든다. Leaf `runs-on` 변경, no-op source churn, rerun storm, gate suppression은 대안이 아니다. |
| Central CO sidecar migration | `.github#1759` open | Strix/OpenCode/Noema/autofix central consumers의 `orchestrator-free-sidecar` migration은 `.github` owner path다. Noema는 provider key/routing authority를 복제하지 않는다. |
| Release/publication | repository release collection은 마지막 fresh read 기준 비어 있었다 | Immutable version/tag/package/image/SBOM/provenance/reproducibility/rollback receipt가 없으므로 source readiness를 release readiness로 승격하지 않는다. 종료 sweep에서 다시 확인한다. |

## DDD and ownership baseline

Noema의 canonical Core Domain은 Agent Runtime과 Workflow / Task Execution이다. State / Checkpoint, Tool / Capability Boundary, Isolation Integration, Policy / Approval, Observability, Recovery는 그 lifecycle을 보조하는 bounded context다. Aggregate와 invariant는 최소 transaction boundary에서 유지하며 durable effect ownership을 외부 서비스의 domain truth와 섞지 않는다.

Context Map의 외부 관계는 ACL/consumer 형태가 기본이다. `contextual-orchestrator`는 LLM provider/model discovery, routing, retry/failover와 credential authority를 소유한다. `quarantine-sandbox-runtime`, Wardnet, EgressWeave는 격리·보안·outbound authority를 소유한다. Keyverse는 identity backend owner다. Context Fabric 계열은 released/versioned contract만 소비한다. Noema는 이 owner들의 source를 복사하거나 cross-service SQL, mutable sibling PR head를 runtime truth로 사용하지 않는다.

## Protected reviewer and Context Fabric convergence

PR #546은 semantic CodeGraph admission과 current-head retrieval provenance의 canonical repair lane이었고 protected main에 통합됐다. 유지해야 할 causal lineage는 complete manifest context, fail-before-execution admission, untrusted prompt-data isolation, Linux exact Git-path identity, hosted coverage/docstring 수리와 exact `7d3de5a...` terminal GREEN이다. 이후 #544는 그 reviewer truth 위에서 Context Graph consumer의 immutable release-source authority를 강화했고 exact `35ab2d08...`의 current CI/reviewer/Security/image GREEN과 zero unresolved threads 뒤 normal merge로 `main@71cd0fb...`가 됐다.

#544가 protected truth가 된 뒤 non-overlapping candidate는 이전 branch tree를 first parent로 보존하고 `71cd0fb...`를 second parent로 하는 ordinary/non-force merge로 다시 수렴시켰다. Predecessor result는 전용하지 않는다. #535와 #536은 각각 `9dfc433...`, `cf5dfa1...`로 ancestry가 정리됐지만 prior semantic restack 과정에서 의도적으로 protected CHANGELOG를 보존하면서 branch-local Unreleased bullet이 빠졌으므로 release bookkeeping repair가 남아 있다.

ADR 0012도 post-merge truth에 맞춘다. #544의 Context Graph release-source-attestation과 envelope-preserving admission은 더 이상 candidate가 아니라 protected consumer behavior이고, ADR은 전체 runtime-orchestration decision이 아직 넓기 때문에 `Proposed`다. Proposed lifecycle은 이미 protected인 slice를 candidate로 되돌리지 않는다.

## Durable workflow transport boundary

PR #542의 private `NOEMA_WORKFLOW_STATE` adapter는 Workflow / Task Execution과 State / Checkpoint authority를 Durable Object serialization point에 결합하지만 arbitrary caller object 전체를 transport할 권위는 갖지 않는다. TypeScript structural typing은 runtime exact-object 보장을 제공하지 않는다.

RED `19c6fa2e...` → `10708af3...`는 top-level object spread를 operation-indexed allowlist로 바꿨다. RED `00e871e1...` → `1f7f5b91...`는 `command.operation`을 한 번 snapshot해 serialized discriminator와 payload-field selection이 갈라지지 않도록 했다. RED `e88a3796...`와 `81abbab5...`는 valid nested claim/checkpoint 안 extra field/getter를 고정했고, production `037ec4e2...`는 claim을 `executionId/planId/taskId/claimId/attempt/effect`, checkpoint 계열을 `executionId/sequence/stateDigest`로 projection한다. `f915d136...`는 malformed non-record nested authority를 거짓-valid object로 정규화하지 않고 Durable Object validator에 남긴다.

Hosted `037ec4e2...` 이후 retained-plan/missing-state와 storage-unavailable paths를 test-only `74a9493...`가 수리했다. 다음 hosted CI는 570 files / 4,045 tests와 statements/functions/lines 100%를 통과했지만 branch 99.98%에서 마지막 unexpected-fault arm을 특정했고 `6793a320...`이 repository seam fault injection으로 private `500 internal_error` containment를 고정했다. Current `6953eaad...`은 이 full delta를 protected #544 main에 non-force restack한 exact candidate다.

## Commercial and buyer gaps

| Priority | Gap | Buyer/operator impact | Current owner | Completion evidence |
| --- | --- | --- | --- | --- |
| P0 | Post-#544 exact-head evidence convergence | Protected reviewer/Context Fabric source가 정리돼도 오래된 PR evidence를 전용하면 같은 governance gap이 남는다. | affected open PRs | protected-main ancestry + current exact-head terminal CI/reviewer/Security/image/package/SBOM/vulnerability/provenance + zero valid findings |
| P0 | Atomic durable workflow authority | Duplicate claim/effect, ambiguous recovery 또는 over-broad private transport가 long-running workflow/audit boundary를 훼손할 수 있다. | issue #541 / PR #542 | single-winner claim, checkpoint CAS, effect-start/recovery/cancellation, payload minimization, missing-state/storage-outage/unexpected-fault fail-closed regressions + exact-head gates + protected merge |
| P0 | GPL-family development/build path | Procurement, redistribution review, clean SBOM acceptance를 막을 수 있다. | issue #531 / PR #540 | exact-base regenerated lockfile policy + restack `197fb05d...` + fresh exact-head gates + protected integration |
| P0 | Reviewer/Maintainer App activation | Least-privilege production publication identity를 운영 증거로 입증할 수 없다. | issues #29 / #227 | live installation/permissions/key custody/rotation + bounded publication/rollback receipt |
| P0 | Protected governance target | Required PR/review/history-rewrite/deletion controls가 없거나 미증명인 상태면 evidence chain을 우회할 수 있다. | issue #27 | stronger live ruleset/protection configuration + direct-push/approval/stale-review/conversation/force-push/deletion behavioral proof |
| P1 | Reviewer finding source identity | Coerced/invalid line identity가 failed-check RCA 또는 inline review publication에 들어가면 current-head evidence가 GitHub의 실제 source anchor와 어긋날 수 있다. | PR #548 | exact-positive-integer/None schema admission regression + current exact-head reviewer/application/Security/image GREEN + protected integration |
| P1 | Reviewer routing/package release notes | #535/#536의 branch-owned behavior가 CHANGELOG에서 빠지면 protected promotion 후 release traceability가 끊긴다. | PR #535 / #536 | exact prior Unreleased bullets를 protected history 위에 복구 + current exact-head gates + protected merge |
| P1 | Work-conserving commercial loop | Automation parse/concurrency regression은 open-PR repair와 buyer-gap dispatch를 동시에 정지시킬 수 있다. | #550 | protected #544 ancestry + exact-head terminal gates + concurrency/path-isolation regressions + protected integration |
| P1 | Commercial acquisition evidence authority | Retained artifact digest만으로 business/legal truth를 위조해선 안 되며 acquisition evidence는 byte integrity와 external authenticity를 분리해야 한다. | issue #5 / PR #526 | `{path, sha256}` retained-source authority + filesystem race hardening + current exact-head gates + protected integration |
| P1 | Immutable Context Graph producer contract | Noema consumer ACL은 protected됐지만 producer의 실제 immutable release evidence가 없으면 production dependency authority가 성립하지 않는다. | producer owner | immutable package/SBOM/provenance/source-manifest/attestation/conformance/envelope-preserving admission evidence |
| P1 | Patch-validator publication | Reviewed source와 shipped image의 동일성이 증명되지 않는다. | issue #66 | immutable digest, signature/attestation, activation/rollback receipt |
| P1 | Authentic production KPI | Synthetic/short-window metrics로 enterprise reliability를 주장할 수 없다. | issue #3 | >=30-day production-origin provenance-bound KPI |
| P1 | Release/deployment/acquisition evidence | merged source만으로 transferable commercial product가 되지 않는다. | issue #5 | immutable release + governed deployment + rollback + customer/revenue/support/rights evidence |

## Performance, test and release gate

Applicable buyer-facing web/API path는 async+k6/E2E로 현실 workload에서 p95 ≤20 ms를 증명해야 하며 초과 시 profile 후 hot path를 수리한다. Sample 축소, 측정 제외, 비현실 cache warm-up으로 gate를 통과시키지 않는다. Owned production docstring/rustdoc, test, edge-case coverage는 각각 100%를 유지한다. Security/performance/math core에 새 hot path가 생기면 Rust-first 원칙과 CPU multithreading, 필요한 GPU parity를 검토한다.

Release는 protected exact head에서만 version/CHANGELOG/tag/package/image/SBOM/provenance/reproducibility/rollback을 하나의 immutable evidence chain으로 만든다. 현재 open candidate와 release evidence gap이 남아 있으므로 release collection의 부재를 source readiness로 위장하지 않는다.

## Completion discipline

Gap은 authoritative completion evidence가 current exact source/head에 결합될 때만 닫는다. Queued/skipped/cancelled/stale checks, predecessor results, documentation existence, synthetic fixtures, model judgement, mutable sibling source는 completion evidence가 아니다. Waiting lane은 다른 안전한 Noema-owned repair를 막지 않는다. 외부 permission/legal/security/product 결정만 실제 blocker로 남긴다.