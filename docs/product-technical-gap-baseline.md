# Noema Product and Technical Gap Baseline

## Authority and update rule

이 문서는 protected 구현, active candidate, transient workflow observation, foreign-owner authority를 구분해 Noema의 제품·기술 Gap을 추적한다. 저장소 파일과 테스트는 해당 revision의 source contract만 증명한다. PR, check, release, central workflow source는 매 판단 시 live exact head에서 다시 읽으며 predecessor GREEN, 문서 존재, model judgement, synthetic fixture를 이후 단계의 권위로 전용하지 않는다.

Protected-source snapshot은 `main@85b17014b8d46eacc95e096ca114568c321d0263`이다. #528 runtime bounded-context foundation, #530 Apache-2.0 source grant, #537 merged GitHub installation-token stateless-format regression, 그리고 PR #546 semantic reviewer admission repair가 protected truth다. ADR 0012는 여전히 `Proposed`이며 protected 구현의 존재가 ADR lifecycle acceptance를 뜻하지 않는다.

## Live observation — 2026-09-06 KST

| Authority | Exact observation | Consequence |
| --- | --- | --- |
| Protected Noema | `main@85b17014b8d46eacc95e096ca114568c321d0263` | Agent Runtime lifecycle, task-plan/checkpoint admission과 PR #546 semantic reviewer evidence boundary가 protected truth다. Durable atomic execution authority는 별도 candidate다. |
| Apache-2.0 source grant | protected main | #530의 source grant는 이미 protected truth다. 현재 licensing gap은 source-license 선택이 아니라 issue #531 / PR #540의 third-party build/development path와 transferable release evidence다. |
| Protected semantic reviewer | PR #546 exact `7d3de5a859be96b953927201d9ba782673f4bb8e`, merged as `85b17014b8d46eacc95e096ca114568c321d0263` | Exact reviewer, application CI, required Security Scan, patch-validator image가 모두 terminal success이고 valid review threads가 해소된 뒤 정상 merge했다. Empty/partial/stale CodeGraph evidence, prompt-shaped retrieval data, Linux exact-path identity와 reviewer coverage/docstring gaps의 causal repairs가 이제 default-branch reviewer source다. |
| Post-#546 descendants | #533 `83c9c9a7a8f4a442fc42d7635167b9a6535f424f`; #548 `2fa21a15ca282e44822dd488ee75e0fe000613cf`; #542 `d4e3f27d44c814dfa358bf087ae943a75ef6b8e7`; #527 `e48d7eb6ea037c2f5a3045829c60d4b14a436b83` | 모두 protected merge commit을 second parent로 둔 ordinary/non-force restack이다. Fresh exact-head CI/reviewer/Security/image가 재생성 중이며 predecessor result는 전용하지 않는다. |
| Additional post-#546 restacks | #547 `e6d6305c02af96f0374c87d33a2cc809b9a2a0e1`; #544 `35ab2d08bbbbcf8b2d530795b7a0107709712285`; #552 `bd5594b4684bc6b01f404de2545bdc236f78ef15`; #553 `b0f747aebac4d5a3588eec3cb4d8b57bc371a28a`; #543 `f6c6af519e4d4cbe7de87dbffada11ea0f144f68`; #539 `365a13e722c5ec28ab4c1aff3916c89e33745fea` | Non-overlapping branch delta를 보존하면서 protected reviewer truth를 ordinary ancestry로 승계했다. 새 exact-head gates가 authoritative evidence다. |
| Durable workflow authority | issue #541 / PR #542 exact `d4e3f27d44c814dfa358bf087ae943a75ef6b8e7` | Predecessor `74a9493...` hosted CI는 570 files / 4,045 tests를 통과했고 statements/functions/lines 100%, branch 99.98%에서 마지막 unexpected-fault containment arm을 특정했다. Test-only `6793a320...`가 private Durable Object `500 internal_error` fallback을 고정했고, current head는 그 delta를 protected #546 위에 non-force restack했다. |
| Context Fabric boundary | #544 exact `35ab2d08bbbbcf8b2d530795b7a0107709712285` | Noema는 immutable released Context Graph contract와 authenticated source-bound attestation만 소비한다. Mutable producer PR/source copy/cross-service SQL은 권위가 아니다. |
| Central workflow trust | `.github/main@fe827e133e7d867015d088777553e22736344c55`; #527 exact `e48d7eb6ea037c2f5a3045829c60d4b14a436b83` | Central #1944는 `noema-review.yml` 실패 시 already-sanitized CO sidecar stderr와 preflight report를 SHA-pinned upload-artifact로 보존한다. Noema RED `30638a19...` → `e2399dac...`가 exact `job_workflow_sha` source pin을 이동했고, current #527은 이 repair를 protected #546 위에 restack했다. Provider/model routing, retry, sanitizer, security/quarantine/outbound policy는 central/contextual-orchestrator owner에 남는다. |
| Central runner/control plane | `.github#712` | Hosted runner는 #546/#550/#542/#548 predecessor를 실제 실행했다. Current exact heads의 queued/pending evidence는 predecessor result로 대체하지 않는다. Leaf `runs-on` 변경, no-op source churn, rerun storm, gate suppression은 대안이 아니다. |
| Central CO sidecar migration | `.github#1759` open | Strix/OpenCode/Noema/autofix central consumers의 `orchestrator-free-sidecar` migration은 `.github` owner path다. Noema는 provider key/routing authority를 복제하지 않는다. |
| Release/publication | repository release collection은 fresh read 기준 비어 있다 | Immutable version/tag/package/image/SBOM/provenance/reproducibility/rollback receipt가 없으므로 source readiness를 release readiness로 승격하지 않는다. |

## DDD and ownership baseline

Noema의 canonical Core Domain은 Agent Runtime과 Workflow / Task Execution이다. State / Checkpoint, Tool / Capability Boundary, Isolation Integration, Policy / Approval, Observability, Recovery는 그 lifecycle을 보조하는 bounded context다. Aggregate와 invariant는 최소 transaction boundary에서 유지하며 durable effect ownership을 외부 서비스의 domain truth와 섞지 않는다.

Context Map의 외부 관계는 ACL/consumer 형태가 기본이다. `contextual-orchestrator`는 LLM provider/model discovery, routing, retry/failover와 credential authority를 소유한다. `quarantine-sandbox-runtime`, Wardnet, EgressWeave는 격리·보안·outbound authority를 소유한다. Keyverse는 identity backend owner다. Context Fabric 계열은 released/versioned contract만 소비한다. Noema는 이 owner들의 source를 복사하거나 cross-service SQL, mutable sibling PR head를 runtime truth로 사용하지 않는다.

## Protected reviewer convergence

PR #546은 semantic CodeGraph admission과 current-head retrieval provenance의 canonical repair lane이었고 이제 protected main에 통합됐다. 유지해야 할 causal lineage는 다음과 같다.

- complete manifest context: RED `377f2374...` → `406c2f99...`, canonical scope와 manifest context를 일치시킨다.
- fail-before-execution admission: RED `f18b665d...` → `fed98d07...`, deterministic over-budget input은 CodeGraph subprocess capability를 소비하지 않는다.
- initial/recovery prompt isolation: `d439058f...`, RED `1dbe0780...` → `a785cd4e...`, RED `244a0294...` → `b6c37025...`; changed paths와 symbol map을 canonical JSON untrusted data로 유지한다.
- Linux exact Git-path identity: RED `3328f7ba...` → `04376e27...`, leading backslash를 Linux filename byte로 보존하면서 traversal/absolute-path rejection을 유지한다.
- hosted convergence: `04376e27...` 이후 real-runner failures가 stale finding identity, branch coverage, unreachable path와 nested semantic-runner docstring을 드러냈고 `b84f0e5a...`, `6e5df50c...`, `95144d5b...`, `7d3de5a...`가 이를 gate 약화 없이 수리했다.
- exact `7d3de5a...`가 reviewer, CI, Security, image GREEN과 zero valid unresolved findings를 얻은 뒤 normal merge로 `main@85b17014...`가 됐다.

이제 남은 reviewer 작업은 source repair가 아니라 downstream candidate의 post-#546 exact-head evidence regeneration이다. #533, #548, #542, #527, #547, #544, #552, #553, #543, #539는 protected reviewer truth를 ordinary ancestry로 승계했다. Current checks가 terminal이 되기 전에는 Draft 해제나 predecessor semantic verdict 전용을 하지 않는다. #535, #536, #540, #550, #526처럼 #546과 CHANGELOG/workflow/reviewer/docs surface가 겹치는 lane은 wholesale tree replacement 대신 semantic restack이 필요하다.

## Durable workflow transport boundary

PR #542의 private `NOEMA_WORKFLOW_STATE` adapter는 Workflow / Task Execution과 State / Checkpoint authority를 Durable Object serialization point에 결합하지만 arbitrary caller object 전체를 transport할 권위는 갖지 않는다. TypeScript structural typing은 runtime exact-object 보장을 제공하지 않는다.

RED `19c6fa2e...` → `10708af3...`는 top-level object spread를 operation-indexed allowlist로 바꿨다. RED `00e871e1...` → `1f7f5b91...`는 `command.operation`을 한 번 snapshot해 serialized discriminator와 payload-field selection이 갈라지지 않도록 했다. RED `e88a3796...`와 `81abbab5...`는 valid nested claim/checkpoint 안 extra field/getter를 고정했고, production `037ec4e2...`는 claim을 `executionId/planId/taskId/claimId/attempt/effect`, checkpoint 계열을 `executionId/sequence/stateDigest`로 projection한다. `f915d136...`는 malformed non-record nested authority를 거짓-valid object로 정규화하지 않고 Durable Object validator에 남긴다.

Hosted `037ec4e2...` 이후 retained-plan/missing-state와 storage-unavailable paths를 test-only `74a9493...`가 수리했다. 그 exact head의 다음 hosted CI는 570 files / 4,045 tests와 statements/functions/lines 100%를 통과했지만 branch 99.98%에서 마지막 unexpected-fault arm을 특정했고 `6793a320...`이 repository seam fault injection으로 private `500 internal_error` containment를 고정했다. Current `d4e3f27...`은 이 full delta를 protected reviewer main에 non-force restack한 exact candidate다.

## Commercial and buyer gaps

| Priority | Gap | Buyer/operator impact | Current owner | Completion evidence |
| --- | --- | --- | --- | --- |
| P0 | Post-#546 semantic evidence convergence | Protected reviewer false-green source는 수리됐지만 오래된 PR evidence를 그대로 전용하면 같은 governance gap이 남는다. | affected open PRs | protected-main ancestry + current exact-head terminal CI/reviewer/Security/image/package/SBOM/vulnerability/provenance + zero valid findings |
| P0 | Atomic durable workflow authority | Duplicate claim/effect, ambiguous recovery 또는 over-broad private transport가 long-running workflow/audit boundary를 훼손할 수 있다. | issue #541 / PR #542 | single-winner claim, checkpoint CAS, effect-start/recovery/cancellation, payload minimization, missing-state/storage-outage/unexpected-fault fail-closed regressions + exact-head gates + protected merge |
| P0 | GPL-family development/build path | Procurement, redistribution review, clean SBOM acceptance를 막을 수 있다. | issue #531 / PR #540 | regenerated lockfile/policy + semantic restack onto protected reviewer truth + exact-head gates + protected integration |
| P0 | Reviewer/Maintainer App activation | Least-privilege production publication identity를 운영 증거로 입증할 수 없다. | issues #29 / #227 | live installation/permissions/key custody/rotation + bounded publication/rollback receipt |
| P0 | Protected governance target | Required PR/review/history-rewrite/deletion controls가 없거나 미증명인 상태면 evidence chain을 우회할 수 있다. | issue #27 | stronger live ruleset/protection configuration + direct-push/approval/stale-review/conversation/force-push/deletion behavioral proof |
| P1 | Work-conserving commercial loop | Automation parse/concurrency regression은 open-PR repair와 buyer-gap dispatch를 동시에 정지시킬 수 있다. | #550 | semantic restack + exact-head terminal gates + concurrency/path-isolation regressions + protected integration |
| P1 | Immutable Context Graph producer contract | Mutable producer evidence는 reproducibility와 consumer isolation을 훼손한다. | #544 + producer owner | immutable package/SBOM/provenance/source-manifest/attestation/conformance evidence |
| P1 | Patch-validator publication | Reviewed source와 shipped image의 동일성이 증명되지 않는다. | issue #66 | immutable digest, signature/attestation, activation/rollback receipt |
| P1 | Authentic production KPI | Synthetic/short-window metrics로 enterprise reliability를 주장할 수 없다. | issue #3 | >=30-day production-origin provenance-bound KPI |
| P1 | Release/deployment/acquisition evidence | merged source만으로 transferable commercial product가 되지 않는다. | issue #5 | immutable release + governed deployment + rollback + customer/revenue/support/rights evidence |

## Performance, test and release gate

Applicable buyer-facing web/API path는 async+k6/E2E로 현실 workload에서 p95 ≤20 ms를 증명해야 하며 초과 시 profile 후 hot path를 수리한다. Sample 축소, 측정 제외, 비현실 cache warm-up으로 gate를 통과시키지 않는다. Owned production docstring/rustdoc, test, edge-case coverage는 각각 100%를 유지한다. Security/performance/math core에 새 hot path가 생기면 Rust-first 원칙과 CPU multithreading, 필요한 GPU parity를 검토한다.

Release는 protected exact head에서만 version/CHANGELOG/tag/package/image/SBOM/provenance/reproducibility/rollback을 하나의 immutable evidence chain으로 만든다. 현재 open candidate와 release evidence gap이 남아 있으므로 release collection의 부재를 source readiness로 위장하지 않는다.

## Completion discipline

Gap은 authoritative completion evidence가 current exact source/head에 결합될 때만 닫는다. Queued/skipped/cancelled/stale checks, predecessor results, documentation existence, synthetic fixtures, model judgement, mutable sibling source는 completion evidence가 아니다. Waiting lane은 다른 안전한 Noema-owned repair를 막지 않는다. 외부 permission/legal/security/product 결정만 실제 blocker로 남긴다.
