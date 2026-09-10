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

`assessProceduralCandidate()` accepts only an admitted direct-child graph, exact evaluation-context digest, disjoint training/held-out case identities, complete paired baseline/candidate observations, finite normalized scores and explicit safety-violation counts. It rejects lineage/context mismatch, train/holdout leakage, missing/duplicate cases, any candidate safety violation, mean score regression, repeated rejection keys and unchanged structure. A passing result is only `eligibleForApproval`; `activationAuthorized` is always `false`. Receipt authentication, durable graph/rejection history, approval CAS, canary/rollback and production outcome measurement are deliberately later boundaries.

`guideProceduralExecution()` consumes only a locally admitted procedural session and a caller-supplied fresh authenticated lifecycle snapshot for the same canonical execution identity. It projects bounded advisory context only while that supplied lifecycle is `running`; accepted, cancellation-requested and terminal states suppress guidance. This pure adapter does not persist lifecycle state and cannot independently prove that a previously authenticated `running` snapshot has not become stale.

On this active branch, candidate `guideProceduralExecutionFromCurrentWorkflowState()` adds a workflow-backed freshness ACL without changing the pure adapter's ownership. It first re-admits the workflow plan and validates the locally admitted procedural session against that exact execution identity before any Durable Object is selected or read. It then issues only the existing private Workflow / Task Execution `read` command to the execution-scoped `NOEMA_WORKFLOW_STATE` owner, validates exact execution/plan identity, complete unique task identities, allowed task states, cancellation identity and transition sequence, and projects only the minimum Agent Runtime state needed for the existing running-only advisory gate. Cancellation and terminal work suppress guidance, initialized pre-start evidence remains unavailable, and other current nonterminal workflow evidence may be treated as running for advisory purposes. The ACL cannot claim/mutate tasks, create lifecycle transitions, retry effects, grant Policy / Approval or tool authority, or replace Agent Runtime lifecycle semantics. Cross-execution plan/session mismatch is rejected before another execution's durable owner can be read.

This candidate closes only the cached-workflow-snapshot gap for workflow-backed executions at source level. Non-workflow Agent Runtime callers still require their own fresh authenticated lifecycle source. Fake/in-memory Durable Object tests do not establish deployed transaction compatibility, restart/failure behavior, availability, synchronous buyer-path p95, durable procedural graph/rejection history, approval CAS, canary/rollback, release, deployment, or activation evidence.

Released cross-service procedural graph schemas belong to `context-graph-contracts`; enterprise adoption records belong to `enterprise-architecture-core`; model discovery/routing remains owned by `contextual-orchestrator`; credentials remain in Keyverse; graph content and product outcome truth remain with the consuming product. No mutable sibling PR-head dependency is accepted as production authority. ADR 0017 remains `Proposed`: protected source integration is not release, deployment, approval, canary or activation evidence.

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
