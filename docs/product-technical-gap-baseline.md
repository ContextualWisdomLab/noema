# Noema Product and Technical Gap Baseline

## Authority and update rule

이 문서는 제품 요구, 구현, 검증, 운영 증거 사이의 현재 차이를 추적한다. 저장소 파일과 테스트는 revision-local 또는 protected-source 구현만 증명한다. PR 상태는 exact head와 live base에서, 운영·배포·고객·매출·법적 증거는 해당 외부 권한에서 다시 확인해야 한다. 문서나 성공 boolean, predecessor check, cancelled/queued run으로 이후 단계의 증거를 만들지 않는다.

현재 protected-source snapshot은 `main@e1ac9d50f6c646f04be8c137c8acdc7200182fcd`다. 이 문서에서 PR candidate를 언급하는 경우 그 구현은 protected truth가 아니며, unchanged exact head의 검증과 정상 merge 뒤에만 protected implementation으로 승격한다.

## Live external observation — 2026-09-05 KST

| Authority | Observation | Consequence |
| --- | --- | --- |
| Protected Noema source | `main@e1ac9d50f6c646f04be8c137c8acdc7200182fcd` | 모든 candidate PR은 이 protected truth와 별도 revision-local authority다 |
| Toolchain/license lane | PR #540 exact head `efe407351345002633a0412582b4f5c838eccea0` replaces the Wrangler/Miniflare/Sharp/Libvips path with pinned workerd/esbuild and carries the regenerated lockfile | GPL-family toolchain removal is implemented only on the Draft candidate until exact-head gates and protected integration complete |
| Lockfile reproducibility | A predecessor hosted run proved stale committed lockfile bytes. The later branch-only `lockfile-reproducibility` workflow became non-rerunnable as a disabled workflow identity; #540 therefore moves canonical regeneration/evidence into established application `ci` and deletes that branch-only workflow | reproducibility remains a hard CI prerequisite; the workflow-registry defect is repaired in candidate source rather than bypassed |
| Reviewer semantic gate | PR #546 exact head `a20ea3065c44d37b4a66740d7d2098ffa55d3da8` repairs a hosted stale reviewer fixture after a real 1-failed/504-passed RED | all pre-#546 reviewer success is historical until semantic-review truth is integrated and regenerated |
| OIDC source authority | PR #527 exact head `179613b43d38c3c9e7b5e51b70234e4850c141f2` binds Noema's exact `job_workflow_sha` authority to audited central `.github/main@3f2f21c577804a473d3c63f87226948dd9b9257a` | central protected movement requires a fresh audit and exact pin roll-forward; unchanged trust-bearing blobs alone do not authorize a stale source commit |
| Hourly writer ownership | Noema still has a repository-local scheduled product writer on protected main. Candidate #551 is Draft because protected central coordinator admission is not yet compatible with Noema's contextual-orchestrator-only provider boundary | do not remove local schedule until a protected central manual-entrypoint/DDD contract can admit Noema without provider-direct credentials |
| Release/publication | no source change by itself establishes immutable release, deployment, customer, revenue or transfer evidence | release and acquisition readiness stay open until the external evidence chain exists |

## Current baseline

| Requirement family | Canonical decision / boundary | Protected or active implementation surface | Executable proof | Residual evidence | Maturity |
| --- | --- | --- | --- | --- | --- |
| Credential exchange and readiness | Worker trust contract와 runtime threat model | `src/index.ts`, `src/worker.ts`, `src/entrypoint.ts`, `src/runtime-entrypoint.ts`, OIDC/replay/rate-limit modules | typecheck, runtime/API/security tests, exact configured coverage | protected deployment smoke와 실제 binding/storage evidence | Implemented on protected main; operational evidence remains separate |
| Reviewer and maintenance control plane | independent App identity, bounded manifest, deterministic fail-closed gates | `reviewer/noema_reviewer/`, maintainer/reviewer workflows, capability-file ingress | reviewer tests, workflow contract tests, current-head review artifacts | #546 protected integration, Maintainer/Reviewer App installation/permission/key-custody evidence | Source contract implemented; semantic-review prerequisite still open |
| Workflow / Task Execution | Noema owns workflow/task state, policy/approval and recovery semantics without copying foreign domain truth | workflow/task modules, state/checkpoint contracts, recovery/observability surfaces | unit/edge contract tests and exact-head CI | current protected integration of open execution lanes and operational recovery exercise | Implemented with active candidate increments |
| Hourly product-development writer | every Noema LLM call remains contextual-orchestrator-owned; central scheduling may dispatch only through an explicit compatible handoff | protected `.github/workflows/hourly-product-development.yml`; #551 is only a Draft handoff candidate | workflow-shape, gateway, lease/publication and stale-head refusal tests | protected central provider-neutral manual-entrypoint/DDD admission plus same-head Noema handoff test | Protected local writer remains canonical; central handoff incomplete |
| Patch-validator supply chain | exact source/image/receipt binding and fail-closed vulnerability policy | image workflow, validator/SBOM/receipt modules | build, runtime, smoke, SBOM, vulnerability and receipt tests | protected operational receipt and registry publication/signing/attestation | Implemented source; operational/publication evidence incomplete |
| Third-party/tooling licensing | GPL/LGPL/AGPL path is not accepted as normal inbound tooling baseline | protected lockfile plus #540 workerd/esbuild candidate | dependency inventory, canonical lock regeneration, install/typecheck/tests/security | #540 unchanged exact-head GREEN and protected merge | Candidate repair implemented; protected gap remains open |
| Lockfile reproducibility | generated dependency bytes must be reproducible under the pinned Node/npm toolchain and evidenced by an enabled canonical workflow identity | #540 moves regeneration into `.github/workflows/ci.yml` and retires branch-only workflow identity | disposable `npm install --package-lock-only`, byte comparison, immutable artifact, fail-before-install mismatch | exact #540 hosted CI GREEN | Candidate repair implemented; hosted acceptance pending |
| Release and deployment | source → package/SBOM/provenance → immutable publication → deployment/rollback | release, publication, deployment and readiness scripts | exact-source/reproducibility/receipt/rollback contract tests | immutable release, protected deployment, recovery and production smoke evidence | Incomplete; repository evidence cannot establish deployment |
| KPI, customer and acquisition | authentic evidence retains source, time and buyer/legal authority | KPI, acquisition manifest/integrity/readiness validators | bounded input, provenance, ordering, integrity and fail-closed tests | authentic 30-day production KPI, customer/revenue and transfer evidence | Incomplete; no commercial-readiness claim |

## Prioritized residual gaps

| Priority | Gap | Buyer/operator impact | Current owner | Authoritative completion evidence | Next executable action |
| --- | --- | --- | --- | --- | --- |
| P0 | Semantic reviewer prerequisite | old reviewer successes can admit non-semantic evidence | PR #546 | unchanged exact head terminal CI/reviewer/Security/image evidence, valid threads resolved, protected merge | wait only for that lane's hosted gates; on failure perform RCA and repair |
| P0 | Toolchain/license and reproducible lock integration | commercial dependency policy and deterministic build evidence are not protected truth yet | PR #540 / issue #531 | exact-head CI regeneration + install/license/security/image evidence and protected merge | validate `efe407351...`; do not restore the disabled branch-only workflow |
| P0 | Exact central OIDC source pin | stale source commit rejects legitimate protected central reviews or weakens source identity if loosened | PR #527 | audited current central protected commit, matching exact Noema pin, exact-head gates, protected merge | re-audit on every central movement; never replace exact equality with a mutable ref |
| P0 | Maintainer/Reviewer App and hourly publication identity activation | automated maintenance and independent review are not proven as production capabilities | issues #29 / #227 | current App installation/permission/key custody/rotation plus successful publication/recovery evidence | complete external App configuration and preserve immutable receipts |
| P0 | Protected governance vs live policy | source verification alone cannot prove merge/release control | issue #27 | live ruleset/branch-protection evidence and observed required workflows | run governance audit against live policy and repair in owning control plane |
| P1 | Provider-neutral central writer handoff | removing Noema's local cron too early creates a writer outage; adding direct NVIDIA/provider keys violates the LLM owner boundary | PR #551 + central owner prerequisite | protected central manual-entrypoint/DDD admission compatible with CO-only Noema, same-head workflow test, then normal Noema merge | keep #551 Draft until central owner contract lands; adopt the handshake and remove cron atomically |
| P1 | Patch-validator operational evidence | verified source image is not yet proven deployed/signed/active | issue #66 | protected receipt, registry digest, signature/attestation and activation proof | run publication pipeline from exact protected source |
| P1 | Authentic 30-day KPI | reliability/performance/operational value is not proven by production-origin data | issue #3 | production-origin time-bound integrity-checked 30-day KPI | run approved collector/verifier against production source |
| P1 | Release/deployment/acquisition evidence | buyer/legal/commercial authority is absent | issue #5 | immutable release/deployment/customer/revenue/legal transfer evidence | satisfy evidence families in order and rerun acquisition audit |

## Documentation contradictions

Historical PR numbers, predecessor heads and past workflow results are provenance only. They are not current owner authority or completion evidence. The Noema product boundary must not absorb contextual-orchestrator provider routing, central `.github` scheduler/reviewer policy, quarantine/security/outbound authority or another product's domain truth. Candidate source is described as candidate until protected integration.

## Completion discipline

A gap closes only when its authoritative completion evidence exists and is bound to the current source/head. Queued, skipped, cancelled, stale, absent, predecessor, synthetic-merge-only or status-only evidence is non-passing. A failed workflow that actually checks out the exact head is source evidence and receives code/config RCA; a workflow that never acquires a runner is control-plane evidence and does not justify source churn. Release, deployment, KPI, customer and transfer claims remain separate authority classes.