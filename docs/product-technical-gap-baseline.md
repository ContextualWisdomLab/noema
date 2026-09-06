# Noema Product and Technical Gap Baseline

## Authority and update rule

이 문서는 Noema의 protected truth, active candidate, transient workflow evidence, foreign-owner authority를 분리한다. 저장소 문서와 테스트는 해당 revision의 source contract만 증명하며 predecessor GREEN, queued/skipped/cancelled run, scanner/model judgement를 다음 revision의 권위로 전용하지 않는다. 외부 제품의 domain truth, LLM provider routing, quarantine/security, outbound authority는 Noema source로 복제하지 않는다.

현재 protected-source snapshot은 `main@e26d771470a4ece873c367b40b3cd6cb03ac7de3`다. 이 revision은 #546 semantic reviewer, #544 immutable Context Graph consumer admission, #533 runner-assignment semantic evidence, #552 cross-session coordination guidance와 #527 OIDC trust roll-forward를 포함한다. #527 exact `d289bfcdb617249c90f9fcc1ba050a59334d07fd`는 application CI, reviewer-ci, required Security Scan, patch-validator-image가 모두 terminal success이고 unresolved review thread가 0인 상태에서 정상 merge됐다.

Central workflow authority는 `.github/main@dd0b96feded94f66ecf59b25a5a9b58cfc8b4f69`다. Central #1960은 Strix sandbox failure를 contextual-orchestrator/provider failure로 잘못 귀속하지 않도록 review finding 분류를 수리한 foreign-owner 변경이며 Noema는 그 provider/retry/sandbox/security 구현을 복제하지 않는다. Protected Noema는 아직 `ALLOWED_WORKFLOW_SHA=43024633eba9d96b0456970391360da5a171fbda`를 신뢰하므로 current central source와 불일치한다. PR #554 exact `12e9efe07f72acdf9f1eb0f7ef0fec54d2ad633c`가 executable regression과 `wrangler.toml` pin을 `dd0b96...`에 함께 rebind하는 fail-closed consumer repair를 소유한다.

## Active candidate convergence — 2026-09-06 KST

#527 merge 뒤 open product/reviewer/documentation lane을 current protected ancestry로 ordinary two-parent/non-force 수렴시켰다. Branch-owned delta가 #527의 trust change와 겹치지 않은 lane은 exact protected blobs를 승계했고, semantic overlap이 있는 #542 `wrangler.toml`은 `NOEMA_WORKFLOW_STATE` binding/export와 당시 protected `ALLOWED_WORKFLOW_SHA=43024633...`을 함께 보존했다. #540은 exact-base lockfile policy `baseSha`를 `e26d771...`로 먼저 rebind한 뒤 restack했다. 이후 central protected source가 `dd0b96...`로 전진해 #554가 새로운 immutable workflow-source trust prerequisite가 됐다.

| Lane | Current exact head | Owned delta / boundary |
| --- | --- | --- |
| Central workflow trust roll-forward | PR #554 exact `12e9efe07f72acdf9f1eb0f7ef0fec54d2ad633c` | `job_workflow_sha` consumer pin only; central `.github` keeps Strix/provider/security implementation authority. |
| Reviewer failed-check evidence | PR #548 exact `049a57dd66be5c0bd23e764315676f7f0ee6efd6` | Failed-check → actionable source binding and exact positive `Finding.line`; no provider/security authority. |
| Shared Kernel | PR #536 exact `8415e3c5e5eb1ed0b276f2d1154f96691d1d4e69` | Provider-neutral `noema-core`; contextual-orchestrator remains provider/model owner. |
| Canonical temp-root fixtures | PR #539 exact `f2a1f4d048b816d09a74bac911cca21cc9cb1613` | Test-fixture path canonicalization only; production capability boundary unchanged. |
| Required-gate regression | PR #543 exact `f07679d0f4d78ed1668147e9cd8fde0ba82fe210` | Forbids docs-only suppression of required gates. |
| Automation threat model | PR #553 exact `4659f8be879568bbd1e8fe2b7248bf4f437fa885` | Corrects historical PR #80 language; no runtime authority change. |
| Workflow concurrency | PR #550 exact `ad0f512b054c4114203760311cb064e1a5323c43` | PR-only supersession cancellation and work-conserving handoff. |
| Orchestrator/free consumer | PR #535 exact `5de3fcb2a6acd1b8190ffab95f729fc6b160b0a8` | Noema consumer/privacy/tool boundary only; CO owns provider/model routing/retry/failover. |
| Acquisition evidence | PR #526 exact `bd4c9079b5c81c0cd63cae6fb0bdd4a845e9fbf2` | Retained `{path, sha256}` source identity plus protected package-digest contract; hashes do not create buyer/legal truth. |
| Toolchain/license | PR #540 exact `6b7f0a7b8c3069a815f74ee654620e59574bd4e1` | issue #531 / #540; lock policy is rebound to current protected base before restack. |
| Durable Workflow / Task Execution | issue #541 / PR #542 exact `9236775bad5476a70601c3dd0331211d42eaed12` | Atomic claim, effect-start, checkpoint CAS, recovery/cancellation, payload minimization and fail-closed fault classes. |
| Documentation authority | PR #547 | Dedicated cross-lane baseline writer; source is current to the heads above. |

Fresh exact-head workflow evidence is observation-scoped and must be refetched after each source mutation. No predecessor GREEN transfers.

## DDD and ownership baseline

Noema의 Core Domain은 **Agent Runtime**과 **Workflow / Task Execution**이다. **Tool / Capability Boundary**, **State / Checkpoint**, **Isolation Integration**, **Policy / Approval**, **Observability**, **Recovery**는 명시적 bounded context다. Side-effect authority, execution identity, claim/checkpoint CAS는 최소 transaction boundary에서 유지하고 foreign domain truth와 혼합하지 않는다.

`contextual-orchestrator`는 provider/model discovery, routing, TTC, retry/failover와 provider credentials를 소유한다. `.github`는 reusable workflow와 organization control-plane source를 소유한다. `quarantine-sandbox-runtime`, Wardnet, EgressWeave/AppGuardrail 계열은 각 isolation/security/outbound truth를 소유한다. Keyverse는 identity backend owner다. `context-graph-contracts`와 Enterprise Architecture 계열은 released/versioned contract만 소비하며 mutable sibling PR head, source copy, cross-service SQL을 runtime truth로 사용하지 않는다.

ADR 0012는 broader runtime-orchestration decision이 아직 넓기 때문에 `Proposed`를 유지한다. 이미 protected인 runtime/context-consumer slice를 Proposed라는 이유로 candidate로 되돌리지 않으며 candidate durable workflow state를 문서만으로 Accepted 처리하지 않는다.

## Commercial and buyer gaps

| Priority | Gap | Canonical owner / lane | Completion evidence |
| --- | --- | --- | --- |
| P0 | Current central workflow-source trust | PR #554 | current central protected SHA, exact consumer pin, unchanged exact-head CI/reviewer/Security/image, protected merge |
| P0 | Current-main exact-head verification | affected open PRs | unchanged exact-head CI/reviewer/Security/image, current review/thread authority, normal merge |
| P0 | Atomic durable workflow authority | issue #541 / #542 | claim/checkpoint/recovery/effect invariants, payload minimization, fault classes, exact-head GREEN, protected merge |
| P0 | GPL-family development/build path | issue #531 / #540 | current-base lock policy, deterministic lockfile, license/security/image/SBOM/provenance gates, protected merge |
| P0 | Reviewer/Maintainer production identity | issues #29 / #227 | live installation/permissions/key custody/rotation and bounded publication/recovery receipts |
| P0 | Governance enforceability | issue #27 / organization control plane | live ruleset/protection evidence and required workflow behavior |
| P1 | Patch-validator publication | issue #66 | protected-source registry digest, signature/attestation, operational receipt and rollback |
| P1 | Authentic operating evidence | issue #3 / issue #5 | production-origin KPI, customer/revenue/legal transfer authority with integrity binding |

## Completion discipline

Workflow가 exact head를 checkout한 뒤 실패하면 code/config/log RCA를 수행한다. Runner를 얻지 못한 queued 상태는 control-plane evidence일 뿐이다. Queue를 줄이기 위한 source churn, `paths-ignore`, runner-selector 우회, self-approval, force push/destructive rebase, required-gate weakening은 완료 수단이 아니다.

Noema source의 Apache-2.0 grant, third-party license compatibility, package/artifact distribution rights, release/deployment, KPI, customer/revenue, legal/IP transfer evidence는 서로 별도 권위다. 문서, scanner, SBOM, successful CI 또는 model judgement가 빠진 권위 클래스를 만들어내지 않는다.
