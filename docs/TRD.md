# Noema Technical Requirements Document

## Status

**Canonical TRD — code-current by repository revision.** `Implemented`, `Planned`, `External evidence`를 분리하며, protected source와 live GitHub/Cloudflare governance를 구현 권한으로 사용합니다. moving PR head나 실행 결과를 timeless architecture fact로 고정하지 않습니다.

## 1. Technical scope

Noema는 다음 세 기술면을 분리해 운영합니다.

1. **Credential exchange data plane** — Cloudflare Worker가 GitHub Actions OIDC를 검증하고 repository-scoped GitHub App installation token을 교환합니다.
2. **Review / maintenance control plane** — GitHub Actions가 exact PR evidence를 수집하고 reviewer/maintainer capability를 역할에 따라 사용합니다.
3. **Evidence / acquisition plane** — technical, security, release, deployment, commercial evidence를 machine-readable artifact로 보존하되 authority와 분리합니다.

## 2. Runtime topology

배포 진입점과 책임은 다음과 같습니다.

```text
src/runtime-entrypoint.ts
  ├─ GET|HEAD /ready → runtime-readiness.ts
  └─ other routes → src/entrypoint.ts
       ├─ bounded bearer/body + outbound policy
       └─ src/worker.ts
            ├─ distributed rate-limit → NoemaRateLimiter
            ├─ exact workflow ref/SHA trust
            ├─ replay protection → NoemaOidcReplayGuard
            └─ src/index.ts
                 ├─ /health
                 └─ /exchange core OIDC + GitHub App protocol
```

자세한 구현과 route ownership은 `ARCHITECTURE.md`, `docs/api-spec.md`를 따릅니다.

### 2.1 `/exchange` inbound body deadline

`POST /exchange`의 JSON body는 UTF-8 wire bytes 기준 최대 **8,192 bytes**이고, body read가 시작된 뒤 전체 stream은 **10,000 ms의 절대 wall-clock deadline** 안에 완료되어야 합니다. 작은 chunk를 반복해서 보내더라도 deadline은 재설정되지 않습니다. 제한시간을 넘긴 incomplete stream은 best-effort로 취소하고 **HTTP 408**의 Noema 표준 JSON error envelope로 실패-폐쇄하며, 이 경계는 distributed rate-limit delegation, OIDC/JWKS 검증, GitHub App private-key 사용과 GitHub API 호출보다 앞에서 적용됩니다.

배포 acceptance는 기존 unauthenticated 401 contract와 별도로 `scripts/smoke-readiness.sh`의 stalled-body deployment smoke가 실제 408/JSON error response를 관찰해야 합니다. Executable proof는 `test/exchange-body-read-deadline.test.ts`, `test/smoke-readiness.test.ts`, `test/smoke-readiness-endpoint-safety.test.ts`, OpenAPI contract와 `docs/api-spec.md`를 함께 사용합니다.

### 2.2 External Claude plugin admission

Tool / Capability Boundary의 로컬 포트 `src/tool-capability/external-extension-admission.ts`는 Claude community plugin 서술자를 exact repository/commit/path/digest와 독립적으로 pin된 AppGuardrail·격리 영수증에 결합한다. 가변 브랜치/태그, 로컬 경로, 마켓플레이스/카탈로그 불일치, 공급자 키, 광역 GitHub 권한, 미선언 셸/파일/네트워크/비밀/MCP, 다른 제품 승인, 만료·롤백, 카탈로그 drift, 관측 내용의 정책 승격, 제품 런타임 플러그인 래퍼는 실패-폐쇄한다. 이 포트는 HTTP API가 아니며 `/exchange` 권한을 바꾸지 않는다. `context-graph-contracts` 불변 계약이 나오기 전에는 로컬 ACL/테스트 더블이다.

### 2.3 Durable external-extension lifecycle evidence

Protected source includes `DurableExternalExtensionLifecycleRepository` under the Tool Capability / State / Checkpoint boundary. A lifecycle stream is keyed by the canonical `external_extension_id` plus exact upstream repository/commit/path, artifact SHA-256, and marketplace-entry SHA-256. The implementation stores an append-only versioned event chain, a transition-ID idempotency index, and a compact current `head` projection in Durable Object storage; it does not reuse the bounded Workflow / Task observability ledger as canonical lifecycle history.

Canonical request and event SHA-256 computation occurs outside the short storage transaction. `readCurrent()` verifies the persisted head against its exact audit tail in O(1) retained-event cardinality; `readAudit()` verifies the complete retained version/hash/stream prefix and the final head/tail binding. New append first obtains a verified current projection, then the transaction revalidates expected version, prior state, and prior head digest before atomically writing event + transition index + head. A stale writer fails closed instead of auto-rebasing.

Exact duplicate transition replay is returned only after immutable request/event/head/tail verification. The same transition ID with different request semantics is a conflict. For a genuinely new `active` transition, `ExternalExtensionLifecycleEvidenceVerifier` re-reads current Noema Policy / Approval and foreign-owner evidence immediately before append. Historical committed replay does not reconsult later mutable authority and therefore cannot rewrite history. AppGuardrail, quarantine/isolation, Egress, Keyverse, and contextual-orchestrator remain foreign owners; Noema stores only immutable references/digests required to bind its own lifecycle decision.

Corrupt/truncated audit evidence is not repaired by the application path. Full recovery procedure, restore constraints, rollback semantics, future compaction constraints, and actual Durable Object recovery rehearsal requirements are defined in `docs/external-extension-lifecycle-recovery.md`. ADR 0015 remains `Proposed` while real-backend performance/recovery, immutable owner-issued activation evidence, release and deployment acceptance remain incomplete.

### 2.4 Protected procedural graph advisory runtime

Protected source includes four library-only Agent Runtime modules: `procedural-input.ts`, `procedural-graph.ts`, `procedural-evolution.ts`, and `procedural-execution.ts`. The admission path snapshots exact-key plain records and dense bounded arrays through data descriptors, rejects accessors/proxies/extra authority-shaped fields, applies canonical execution identity and bounded procedural identity rules, canonicalizes graph ordering, and computes SHA-256 graph and structure identities under an explicit serialized byte ceiling. These digests are local content identities, not signatures or a released cross-language wire standard.

`createProceduralGraph()` produces a deep-frozen tenant/task/graph snapshot and registers it in a module-local admission set. `startProceduralSession()` requires that admitted graph plus exact tenant/task/execution/digest agreement and returns an execution-pinned, locally admitted session. Directed neighborhood traversal is cycle-safe and bounded by hops/edge count; unknown procedures and exhausted context budgets return explicit abstention with no hidden full-graph fallback. Graph text stays inert `advisory_only` data and grants no tool, retry, lifecycle, Policy / Approval, credential, or product-domain authority.

`assessProceduralCandidate()` accepts only an admitted direct-child graph, exact evaluation-context digest, disjoint training/held-out case identities, complete paired baseline/candidate observations, finite normalized scores and explicit safety-violation counts. It rejects lineage/context mismatch, train/holdout leakage, missing/duplicate cases, any candidate safety violation, mean score regression, repeated rejection keys and unchanged structure. A passing result is only `eligibleForApproval`; `activationAuthorized` is always `false`.

Protected source extends that screening boundary with exact paired evaluation-receipt identities, canonical evaluator-envelope binding, and a separately authenticated P-256 ECDSA evaluator-handoff verifier selected by the composition root. It binds evaluation context, dataset/rubric/model/tool/protocol/validation-plan evidence and rejection/disposition semantics without moving signer-key custody, trust selection, or private keys into Agent Runtime. Protected #597 then adds bounded durable evaluation/rejection history under the existing State / Checkpoint boundary. Only admitted graph/evaluation/authenticated signed-claim identities and payload-minimized rejection evidence are retained, with monotonic CAS, exact replay, digest-chain verification, duplicate-handoff refusal, restart reconstruction, and fail-closed bounded capacity. History retention is evidence state, not Policy / Approval or activation authority.

Protected #601 adds the separate Noema Policy / Approval CAS boundary. `DurableProceduralPolicyApprovalRepository` consumes a locally admitted graph, a repository-verified current State / Checkpoint history snapshot, and an independently supplied exact policy decision. It binds graph/history/evaluator-handoff identities and expected approval version into an append-only digest-linked event chain. `approve_for_pilot` requires the latest history to remain approval-eligible with `validation_non_regression`; `revoke` may bind newer authenticated non-eligible evidence such as `score_regression`, but only when the prior state is `approved_for_pilot`. Exact decision replay is idempotent, a stale writer loses the monotonic CAS race, and every event/snapshot retains `activationAuthorized:false`. The repository does not select/custody signer keys, publish graphs, route providers, invoke tools, or grant activation.

`guideProceduralExecution()` consumes only a locally admitted procedural session and a caller-supplied fresh authenticated lifecycle snapshot for the same canonical execution identity. It projects bounded advisory context only while that supplied lifecycle is `running`; accepted, cancellation-requested and terminal states suppress guidance. This pure adapter does not persist lifecycle state and cannot independently prove that a previously authenticated `running` snapshot has not become stale.

Protected source `guideProceduralExecutionFromCurrentWorkflowState()` provides a workflow-backed freshness ACL without changing the pure adapter's ownership. It first re-admits the workflow plan and validates the locally admitted procedural session against that exact execution identity before any Durable Object is selected or read. It then issues only the existing private Workflow / Task Execution `read` command to the execution-scoped `NOEMA_WORKFLOW_STATE` owner, validates exact execution/plan identity, complete unique task identities, allowed task states, cancellation identity and transition sequence, and projects only the minimum Agent Runtime state needed for the existing running-only advisory gate. Cancellation and terminal work suppress guidance, initialized pre-start evidence remains unavailable, and other current nonterminal workflow evidence may be treated as running for advisory purposes. The ACL cannot claim/mutate tasks, create lifecycle transitions, retry effects, grant Policy / Approval or tool authority, or replace Agent Runtime lifecycle semantics. Cross-execution plan/session mismatch is rejected before another execution's durable owner can be read.

This protected ACL closes only the cached-workflow-snapshot gap for workflow-backed executions at source level. Non-workflow Agent Runtime callers still require their own fresh authenticated lifecycle source. Fake/in-memory Durable Object tests do not establish deployed transaction compatibility, restart/failure behavior, availability, synchronous buyer-path p95, graph publication, canary/rollback, release, deployment, or activation evidence. The #597 history path and #601 Policy / Approval CAS path also still require real Durable Object compatibility/restart/failure and latency evidence before they can be treated as production-operable persistence. Publication/activation must freshly re-read and reconcile current State / Checkpoint and current Policy / Approval because either authority may advance after an earlier point-in-time decision.

Released cross-service procedural graph schemas belong to `context-graph-contracts`; enterprise adoption records belong to `enterprise-architecture-core`; model discovery/routing remains owned by `contextual-orchestrator`; credentials and live signer trust selection remain in Keyverse/owner composition; graph content and product outcome truth remain with the consuming product. No mutable sibling PR-head dependency is accepted as production authority. ADR 0017 remains `Proposed`: protected source integration, authenticated evaluator verification, bounded State / Checkpoint retention, and protected #601 Policy / Approval CAS are not release, graph publication, canary or activation evidence.

## 3. Identity and revision semantics

### 3.1 PR exact head

- PR 판단은 GitHub가 현재 반환한 immutable `head.sha`에 결합합니다.
- checkout 후 `git rev-parse HEAD`와 expected head가 다르면 repository code 실행 전에 실패해야 합니다.
- write 직전 current PR을 다시 읽고 state/base/head/repository identity가 예상과 다르면 mutation을 중단합니다.
- predecessor-head CI, review, model output은 새 head로 승계하지 않습니다.

### 3.2 Live base tip

PR event payload의 `base.sha`는 event-time snapshot입니다. current integration/release 판단이 base movement에 민감하면 named base ref의 live tip을 독립적으로 조회하고 event snapshot과 분리해 보존합니다.

- stale base를 current authority로 취급하지 않습니다.
- stacked PR에서는 immediate predecessor branch의 live tip을 dependency authority로 봅니다.
- early retarget으로 required check를 인위적으로 발생시키기보다 dependency order를 보존합니다.

### 3.3 Workflow source identity

일반 workflow와 reusable workflow를 혼합하지 않습니다.

```text
workflow_ref     + workflow_sha
job_workflow_ref + job_workflow_sha
```

둘 중 선택된 family의 ref와 SHA가 모두 canonical이고 reviewed binding과 일치해야 합니다. moving ref alone은 credential authority가 아닙니다.

## 4. Evidence classes and authority

| Evidence class | Source | Allowed use | Forbidden inference |
| --- | --- | --- | --- |
| `check_evidence` | GitHub Check Runs | workflow/job execution state | approval, release, deploy authority |
| `runner_assignment_evidence` | GitHub Actions workflow-job assignment/runtime metadata | runner가 job을 실제 수신·시작할 수 있었는지에 대한 operational evidence | source correctness, check success, approval, merge authority |
| `status_evidence` | Commit Status API | integration status | check run 또는 formal review 대체 |
| `review_evidence` | GitHub formal review/thread | reviewer decision / conversation state | 다른 head에 자동 승계 |
| `scanner_evidence` | OSV/Trivy/CodeQL/SARIF 등 | vulnerability/security evidence | 실행 revision을 확인하지 않은 exact-head claim |
| `model_judgement` | CodeRabbit/Noema/OpenCode/LLM | diagnostic/review reasoning | eligible GitHub approval 또는 merge authority |
| `merge_authority` | branch/ruleset + merge API | protected source integration | release/deploy completion |
| `release_evidence` | package/tag/provenance/SBOM/receipt | versioned artifact acceptance | production deployment proof |
| `deployment_evidence` | protected environment/runtime receipt | production activation | customer/revenue/acquisition proof |

Runner assignment은 workflow conclusion과 별도입니다. `queued_unassigned`, `assigned_not_started`, `running`, `terminal`, `unknown`을 구분하며, runner가 배정되거나 job이 시작됐다는 사실은 Actions control plane이 해당 작업을 실행할 수 있었음을 보여 줄 뿐 application test 또는 security gate가 성공했다는 뜻이 아닙니다. 반대로 장시간 `queued_unassigned` 상태는 source failure로 분류하지 않고 runner capacity, billing, runner-group access 또는 organization policy 같은 operational RCA 입력으로만 사용합니다. Read-only audit은 protected main의 `scripts/actions-runner-assignment-audit.mjs`와 `scripts/lib/actions-runner-assignment-*.mjs`에 구현되어 있고 `test/actions-runner-assignment-*.test.ts`가 계약을 검증합니다. Issue #30은 외부 조직 수준 billing, policy, runner-group evidence의 owner이며, 그 원인은 live administrative evidence 없이는 확정하지 않습니다.

Queued, requested, waiting, pending, in-progress, skipped-required, neutral-required, cancelled, absent, failed, stale-head, predecessor-head 또는 synthetic-only evidence는 exact-head passing evidence가 아닙니다.

## 5. Pagination and evidence completeness

GitHub collection API가 pagination을 제공하면 Noema policy는 첫 page만 보고 결론 내리지 않습니다.

- check runs: complete pagination 후 suite/app/name identity로 latest-attempt semantics를 계산합니다.
- statuses: complete pagination 후 context별 최신 상태를 계산합니다.
- reviews: complete pagination 후 reviewer별 effective latest state를 계산합니다.
- review threads: GraphQL pagination을 끝까지 순회합니다.
- workflow runs/artifacts/rulesets처럼 policy에 material한 목록도 같은 원칙을 적용합니다.

Pagination 실패나 malformed page는 incomplete evidence이며 fail closed입니다.

## 6. Review and approval requirements

- `COMMENTED`, text comment, reaction, commit status, check run, model verdict는 `APPROVED` review가 아닙니다.
- approval 필요 여부는 문서 관행이 아니라 live ruleset/branch policy와 explicit Noema governance requirement를 분리해 판정합니다.
- required independent approval이 실제로 적용될 때는 non-author이고 current policy에서 eligible한 reviewer여야 합니다.
- reviewer/team/App eligibility를 가능한 경우 API로 먼저 검증합니다.
- 422/non-collaborator로 disproven된 route는 eligibility가 변하기 전 반복 요청하지 않습니다.
- head change 시 stale approval을 current approval로 승격하지 않습니다.

## 7. Writer lease and repository mutation

### 7.1 Lease

Noema dedicated loop는 `ContextualWisdomLab/noema`만 write합니다. 다른 dedicated writer loop가 활성인 CWL repository는 read-only dependency입니다.

동일 repository에서도 다른 writer가 같은 branch/source를 이동시키면 해당 branch를 현재 run 동안 freeze하고 다른 work item으로 회전합니다.

### 7.2 Safe write paths

허용 우선순위:

1. connector-backed existing-file mutation with current blob SHA / conditional identity;
2. trusted local checkout with verified repository remote, clean state, exact head/base, credential scope와 network/toolchain;
3. server-side API mutation that accepts expected source identity.

금지:

- `.github/workflows/repair-*`;
- self-modifying GitHub Actions;
- temporary branch-patching `contents:write` workflow;
- encoded patch/finalizer workflow;
- `GITHUB_TOKEN` write fallback that changes authority semantics;
- protection bypass or synthetic approval.

## 8. RCA and feasibility protocol

자동화의 실패는 blocker label로 곧장 종료하지 않습니다.

```text
exact evidence
→ reproduce/isolate
→ falsifiable root-cause hypothesis
→ materially distinct remedies
→ empirical feasibility gate
→ smallest safe action
→ observable proof
```

각 remedy는 다음을 검증합니다.

- caller authority / credential permission;
- tool/API capability and exact target support;
- current head/base/blob/ref identity;
- repository policy and reviewer eligibility;
- stack/dependency order and active writer;
- timeout/rate-limit/provider state;
- remaining run budget;
- blast radius, reversibility/rollback;
- security/privacy/coverage/review impact;
- exact observable success oracle.

분류값:

- `execute_now`
- `defer_until_trigger`
- `read_only_dependency`
- `external_only`
- `reject`

세 개의 materially distinct hypothesis가 실패하면 symptom patch를 계속 쌓지 않고 architecture/governing contract를 재검토합니다.

## 9. Work-conserving scheduler semantics

하나의 action이 blocked되면 전체 run을 종료하지 않습니다. executable queue는 다음 가치 순서로 소비합니다.

1. gate-clean PR merge;
2. current valid finding fix;
3. repository-owned blocker removal;
4. addressed thread / duplicate cleanup;
5. Draft/stack advancement;
6. 다른 open PR/issue;
7. protected-main operational proof;
8. authoritative documentation repair;
9. bounded buyer-visible product/control slice;
10. security/reliability/observability/accessibility/packaging/acquisition hardening.

각 mutation 후 queue top으로 돌아갑니다. pending check/review는 keyed defer 후 다른 작업을 수행합니다. 종료 전 fresh double sweep에서 executable item이 하나라도 있으면 계속합니다.

### 9.1 Deliverable handoff state machine

Scheduler가 만든 산출물은 다음 실행 가능한 authority 또는 acceptance boundary로 반드시 이어집니다.

```text
prompt update → repository-consumed policy and executable contract
RCA → feasible action
design → implementation
test → production code
documentation assessment → canonical repository files
local changes → intentional commit → pull request
pull request → exact-head checks → review remediation → protected merge
protected merge → protected-main operational acceptance → queue top
```

각 handoff는 다음 기술 규칙을 따릅니다.

- prompt update는 repository-consumed policy와 executable regression을 남겨야 합니다.
- RCA가 `execute_now` remedy를 찾으면 test-first mutation과 exact proof로 이어져야 합니다.
- design은 승인된 bounded scope에서 implementation과 realistic validation으로 이어져야 합니다.
- RED test는 production code와 focused/full GREEN verification으로 이어져야 합니다.
- documentation assessment는 부족함을 prose로만 보고하지 않고 canonical files, indexes, ADR status, traceability와 machine-checkable contracts를 갱신해야 합니다.
- local mutation은 exact branch/blob identity에 결합된 intentional commit과 reviewable pull request로 이어져야 합니다.
- pull request는 exact-head checks, current review remediation, protected merge eligibility까지 이어져야 합니다.
- protected merge는 protected-main operational acceptance와 다음 queue item으로 이어져야 합니다.

한 handoff가 외부 승인, pending CI, active writer 또는 read-only dependency 때문에 막히면 그 lane만 `defer_until_trigger`로 보존하고 다른 non-conflicting lane으로 회전합니다. Documentation repair는 intermediate이며 source, security, review, operability 또는 buyer-visible work가 안전하게 남아 있으면 같은 invocation에서 계속합니다.

종료 전에는 **double exit sweep**을 수행합니다. 첫 sweep에서 executable item이 발견되면 실행한 뒤 live state로 두 번째 sweep을 다시 수행합니다. 두 번째 fresh sweep도 비어 있거나 practical run budget이 실제로 소진된 경우에만 invocation이 종료될 수 있습니다. User-visible report는 completion state가 아닙니다.

## 10. Commercial-readiness maintenance control plane

`.github/workflows/hourly-commercial-readiness.yml`의 intended contract:

- trusted default-branch source만 실행;
- dedicated Maintainer App token으로 PR read/dispatch/merge;
- exact current head에 required checks와 formal review를 결합;
- unresolved thread와 changes requested를 fail closed;
- same-head active Noema review가 있으면 duplicate dispatch 금지;
- merge 직전 exact state를 다시 수집;
- merge API에 expected SHA를 전달;
- report artifact를 bounded machine-readable evidence로 보존.

운영 activation은 issue #29의 외부 provisioning evidence가 완료되기 전 enabled로 간주하지 않습니다.

## 11. Product-development control plane

`.github/workflows/hourly-product-development.yml`은 proposal-only입니다.

### Trust-domain separation

1. **proposal runner**: OpenCode가 `contextual-orchestrator`의 released gateway contract와 `orchestrator/free` routing alias만 사용하며 repository write credential은 받지 않습니다.
2. **verification runner**: immutable artifact를 fresh source에 적용하고 release verification을 수행하며 model/maintainer credential을 받지 않습니다.
3. **publication runner**: verified immutable patch를 실행하지 않고 재구성한 후 late-bound Maintainer App credential만 사용합니다.

### Proposal contract

- changed-file와 diff-byte budget;
- symlink/gitlink refusal;
- exact base/patch/artifact identity;
- model-created PR metadata는 untrusted input;
- branch/PR publication은 bounded one-proposal transaction으로 취급;
- publisher failure cleanup은 run-owned exact branch/PR identity 밖으로 확대되지 않아야 함.

Atomic proposal-publication과 publisher-lease control은 protected main에 구현되어 있으며 `test/hourly-product-development-publisher-lease.test.ts`가 source contract를 검증합니다. 실제 scheduled publication과 rollback exercise는 별도 operational evidence입니다.

## 12. LLM and credential contract

- GitHub Actions development/maintenance model work는 OpenCode Agent가 `contextual-orchestrator`의 released API/client/schema contract를 통해 수행합니다.
- routing identity는 `orchestrator/free`이며 Noema가 provider/model/group/paid fallback을 선택하지 않습니다.
- gateway endpoint와 inference capability는 `NOEMA_LLM_API_URL`, 전용 gateway token은 `NOEMA_LLM_API_KEY`로 전달합니다.
- upstream provider credentials(`NVIDIA_NIM_API_KEY`, `NVIDIA_NIM_API_KEY_SUB`, `BYTEZ_API_KEY`, `OPENROUTER_API_KEY`, `OPENAI_API_KEY`)은 Noema model jobs의 credential contract가 아니며 repository가 읽거나 fallback authority로 사용하지 않습니다.
- Noema는 model wall-clock timeout, retry, provider failover를 별도로 소유하지 않습니다. 사용자 취소, provider 종료, 관리자 정책 timeout은 서로 다른 종료 원인으로 보존합니다.
- `COPILOT_GITHUB_TOKEN`은 사용하지 않습니다.
- reviewer App key contract를 autonomous development 때문에 변경하지 않습니다.
- model output은 untrusted judgement evidence이며 deterministic security/governance gate와 분리합니다.

## 13. Package and toolchain reproducibility

- GitHub Action source는 full immutable SHA로 pin합니다.
- Node/npm identity는 lockfile을 생성·검증하는 acceptance context에서 고정해야 합니다.
- lockfile diff는 declared package graph만 아니라 package object metadata drift도 검토 가능해야 합니다.
- base lock evidence는 current live base에 결합되어야 하며 base drift를 성공한 verification 뒤에도 재검사해야 합니다.
- lifecycle install scripts는 allow/deny authority를 명시적으로 검토합니다.

Deterministic Node/npm과 lockfile control은 protected main의 `.github/lockfile-change-policy.json`, `scripts/lockfile-change-control.mjs`, package-manager/lockfile contract tests에 구현되어 있습니다. 각 변경의 current exact-head verification은 observation-scoped evidence로 다시 수집합니다.

## 14. Test and coverage requirements

- production statements: 100%.
- production branches: 100%.
- functions/lines: tooling이 노출하는 경우 100%.
- reviewer Python: line/branch 100%, public docstrings 100%.
- workflow/document contracts: shipped YAML/docs/source 관계를 executable tests로 검증.
- security: hostile input, stale identity, partial pagination, duplicate keys, symlink/race, provider/network failure 포함.
- procedural graph protected source: exact-key descriptor-safe input, forged/copied/proxy graph/session rejection, canonical digest/order behavior, cycle-safe bounded traversal, unknown/budget abstention, direct-child lineage, paired held-out completeness, train/holdout leakage, invalid score/safety regression, rejection replay, `activationAuthorized: false`, signed evaluator-envelope/handoff identity and expiry, durable history CAS/replay/integrity/restart/capacity behavior, Policy / Approval CAS approval/revocation/exact-replay/stale-writer behavior, same-execution lifecycle gating and non-running suppression must remain executable regressions.
- numerical/psychometric 계산이 추가되면 Rust-first CPU reference와 material GPU parity를 별도 requirement로 적용합니다.

자세한 내용은 `docs/TEST_STRATEGY.md`를 따릅니다.

## 15. Release and deployment requirements

Release는 merge와 별도입니다. 다음이 동일 integrated protected source에 결합되어야 합니다.

- exact CI/security/coverage;
- packaging and dependency integrity;
- reproducible toolchain;
- SBOM/provenance;
- formal review and governance;
- version + CHANGELOG;
- immutable release receipt;
- migration/rollback/recovery where state/schema changes;
- release acceptance.

Deployment는 protected environment/governance, active runtime identity, traffic state, smoke/KPI evidence와 rollback identity를 별도로 요구합니다.

## 16. Persistence and data model

실제 Worker persistence는 목적별 SQLite Durable Object state를 사용합니다. PR/review/check/release/acquisition entity가 전부 relational database에 구현되어 있다고 주장하지 않습니다. `docs/ERD.md`는:

- **persisted runtime entities**와
- **conceptual evidence/control entities**

를 명시적으로 구분합니다. conceptual model은 향후 evidence store 또는 schema를 설계할 때 의미를 보존하기 위한 contract입니다.

Protected external-extension lifecycle persistence owns exact-stream event records, transition-id replay index, and compact head projection. This storage is append-only for lifecycle events and is semantically separate from the bounded Workflow / Task transition-receipt ledger. It persists Noema lifecycle decision evidence plus immutable foreign-owner references/digests, never editable foreign-owner truth. Real Durable Object performance/recovery and immutable activation-owner evidence remain operational acceptance work.

The procedural graph/session and candidate-decision authorities remain process-local immutable values, but protected #597 now owns bounded durable evaluation/rejection history under the existing State / Checkpoint boundary. The retained history binds admitted graph/evaluation/authenticated signed-claim identities and minimized rejection evidence with monotonic CAS, exact replay, digest-chain integrity, restart reconstruction, duplicate-handoff refusal, and fail-closed bounded capacity. A retained history event is not durable approval or activation authority by itself.

Protected #601 separately owns the Noema Policy / Approval CAS event stream for a procedural graph lineage. It retains exact independent decision identity, action, policy version, graph/history/evaluator-handoff evidence, expected approval version, prior-event digest and resulting approval/revocation state while forcing `activationAuthorized:false`. State / Checkpoint remains the evaluation-history owner; the Policy / Approval ledger does not duplicate Workflow / Task or lifecycle truth. Live signer trust, graph publication, current non-workflow lifecycle/revocation, fresh publication-time cross-authority reconciliation, canary/rollback and product-owner outcome evidence remain separate authorities.

## Protected procedural implementation

Protected source implements procedural graph admission/session, offline direct-child candidate screening, exact paired evaluation-receipt/envelope identities, separately authenticated signed evaluator handoff, bounded State / Checkpoint evaluation/rejection history, protected #601 Policy / Approval CAS, and the #586 lifecycle-gated advisory projection with hostile tests for malformed descriptors, forged local authority, graph identity/scope, resource bounds, cycle-safe traversal, abstention, lineage/context mismatch, train/holdout leakage, paired evidence completeness, safety regression, measured-score regression, signed claim/disposition binding, history replay/integrity/restart/capacity, approval/revocation/exact-replay/stale-writer CAS, same-execution lifecycle binding, and non-running suppression. ADR 0017 remains `Proposed`; root architecture and traceability retain graph content as advisory-only and activation as unauthorized. This source is not a deployed route, production graph publication store, automatic refiner, live Keyverse trust-selection owner, automatic activation system, or organization rollout.

Protected source reuses the Workflow / Task Execution Durable Object only as current task/cancellation evidence for procedural guidance through the #589 workflow-backed current-state ACL. It does not create a second lifecycle database, and it validates local session/execution identity before any execution-scoped durable read. This protected ACL narrows stale workflow-backed guidance at source level but does not establish deployed Durable Object behavior, universal lifecycle freshness, publication-time reconciliation, or rollout authority.

## Implemented

다음은 current repository에 구현된 기술 계약이며 정확한 protected-main revision과 branch별 변경은 live GitHub source로 확인합니다.

- Worker routing, OIDC/GitHub App exchange, bounded request/egress controls.
- distributed rate-limit and OIDC replay Durable Objects.
- external-extension admission and append-only lifecycle storage/runtime binding, while real-backend operational/activation evidence remains separate.
- procedural graph local admission/session, deterministic direct-child screening, authenticated evaluator-envelope/handoff binding, bounded durable evaluation/rejection history, protected #601 Policy / Approval CAS, lifecycle-gated advisory projection, and workflow-backed current-state ACL while live trust selection, deployed durability/latency, graph publication and rollout evidence remain separate.
- central-review/commercial-readiness/product-development/readiness/acquisition workflow 계열과 policy/test 기반.
- evidence-class separation을 반영한 maintenance policy code.
- configured 100% production coverage and reviewer-quality gates.
- exact workflow-ref/SHA runtime readiness와 architecture documentation.

## Planned

- protected-main operational acceptance of enabled hourly maintenance.
- atomic proposal publication의 실제 scheduled run 및 rollback/recovery exercise.
- patch-validator protected-main operational receipt와 registry publication/signing/attestation/activation.
- issue #30의 organization-level runner-assignment root-cause evidence.
- release/deployment provenance chain의 실제 production acceptance.
- external-extension lifecycle actual Durable Object current-projection/contended-append p95 measurement, partition/lock/storage-growth capture, full audit rebuild, backup/restore or equivalent recovery rehearsal, and rollback/suspension verification before ADR 0015 can advance.
- released procedural wire-contract work, live Keyverse/owner trust-selection wiring, non-workflow current-lifecycle/revocation authority, deployed workflow-state plus #597 history and #601 Policy / Approval compatibility/restart/failure/p95 evidence, publication-time fresh State / Checkpoint + Policy / Approval reconciliation, graph publication, canary/rollback evidence, and product-owner production outcome measurement before ADR 0017 can advance beyond its current Proposed/advisory-only state.

## External evidence

repository source만으로 충족되지 않는 항목:

- issue #27 enforceable `main` governance/ruleset and direct-push rejection.
- issue #29 Maintainer/Reviewer App installation, exact permissions, variables/secrets, activation and rollback.
- issue #30의 historical/intermittent runner-assignment root cause를 확정하는 organization-level Actions billing/policy/runner-group evidence.
- private vulnerability-reporting repository setting and benign exercise where required.
- production environment protection and independent reviewer configuration.
- production KPI/log provenance, deployment receipts/attestations.
- live procedural signer/trust selection, enterprise adoption approval, non-workflow current-state/revocation evidence, deployed Workflow / Task, durable-history and Policy / Approval compatibility/performance, publication-time fresh cross-authority reconciliation, graph publication, canary/rollback evidence, and product outcome truth from their owning systems.

## 17. References

설계의 표준·primary-source 근거와 APA 7th bibliography는 `docs/doctoring/architecture-trust-boundaries.md`를 canonical source로 사용합니다. 세부 API/운영 근거는 해당 doctoring/runbook의 source verification note를 따릅니다. External-extension lifecycle recovery procedure is `docs/external-extension-lifecycle-recovery.md`; lifecycle architecture remains governed by ADR 0015 and the canonical Context Map. Procedural graph method provenance and adoption evidence are documented in ADR 0017 and `docs/doctoring/procedural_graph_adoption.md`; method citations do not become CWL production evidence.
