# Noema Technical Requirements Document

## Status

**Proposed canonical TRD.** 이 문서는 PR #71에서 검토 중입니다. `Implemented`, `Planned`, `External evidence`를 분리하며, moving PR head나 실행 결과를 timeless architecture fact로 고정하지 않습니다. 현재 실행상태는 live GitHub/Cloudflare evidence가 우선합니다.

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

Runner assignment은 workflow conclusion과 별도입니다. `queued_unassigned`, `assigned_not_started`, `running`, `terminal`, `unknown`을 구분하며, runner가 배정되거나 job이 시작됐다는 사실은 Actions control plane이 해당 작업을 실행할 수 있었음을 보여 줄 뿐 application test 또는 security gate가 성공했다는 뜻이 아닙니다. 반대로 장시간 `queued_unassigned` 상태는 source failure로 분류하지 않고 runner capacity, billing, runner-group access 또는 organization policy 같은 operational RCA 입력으로만 사용합니다. Issue #30이 reliability owner이고 PR #88이 이 read-only diagnostic evidence를 repository-owned control로 구현 중입니다. 조직 수준 원인은 live administrative evidence 없이는 추정으로 확정하지 않습니다.

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

1. **proposal runner**: OpenCode + NVIDIA NIM, no repository write credential.
2. **verification runner**: immutable artifact를 fresh source에 적용하고 release verification, no NIM/maintainer credential.
3. **publication runner**: verified immutable patch를 실행하지 않고 재구성한 후 late-bound Maintainer App credential만 사용.

### Proposal contract

- changed-file와 diff-byte budget;
- symlink/gitlink refusal;
- exact base/patch/artifact identity;
- model-created PR metadata는 untrusted input;
- branch/PR publication은 bounded one-proposal transaction으로 취급;
- publisher failure cleanup은 run-owned exact branch/PR identity 밖으로 확대되지 않아야 함.

PR #80의 atomic publisher와 scheduler continuation 개선은 protected-main에 병합될 때까지 `Planned`입니다.

## 12. LLM and credential contract

- GitHub Actions development/maintenance agent: OpenCode Agent.
- model credential: `NVIDIA_NIM_API_KEY`.
- `COPILOT_GITHUB_TOKEN`은 사용하지 않습니다.
- reviewer App key contract를 autonomous development 때문에 변경하지 않습니다.
- `contextual-orchestrator`를 사용할 때 Noema는 upstream provider secret을 직접 받지 않고 gateway-level contract를 사용합니다.
- model output은 untrusted judgement evidence이며 deterministic security/governance gate와 분리합니다.

## 13. Package and toolchain reproducibility

- GitHub Action source는 full immutable SHA로 pin합니다.
- Node/npm identity는 lockfile을 생성·검증하는 acceptance context에서 고정해야 합니다.
- lockfile diff는 declared package graph만 아니라 package object metadata drift도 검토 가능해야 합니다.
- base lock evidence는 current live base에 결합되어야 하며 base drift를 성공한 verification 뒤에도 재검사해야 합니다.
- lifecycle install scripts는 allow/deny authority를 명시적으로 검토합니다.

PR #76과 #78이 이 영역의 active implementation이며 protected integration 전에는 repository-wide 완료로 표시하지 않습니다.

## 14. Test and coverage requirements

- production statements: 100%.
- production branches: 100%.
- functions/lines: tooling이 노출하는 경우 100%.
- reviewer Python: line/branch 100%, public docstrings 100%.
- workflow/document contracts: shipped YAML/docs/source 관계를 executable tests로 검증.
- security: hostile input, stale identity, partial pagination, duplicate keys, symlink/race, provider/network failure 포함.
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

실제 Worker persistence는 현재 두 Durable Object의 목적별 SQLite state가 핵심입니다. PR/review/check/release/acquisition entity는 전부 relational database에 구현되어 있다고 주장하지 않습니다. `docs/ERD.md`는:

- **persisted runtime entities**와
- **conceptual evidence/control entities**

를 명시적으로 구분합니다. conceptual model은 향후 evidence store 또는 schema를 설계할 때 의미를 보존하기 위한 contract입니다.

## Implemented

다음은 current repository에 구현된 기술 계약이며 정확한 protected-main revision과 branch별 변경은 live GitHub source로 확인합니다.

- Worker routing, OIDC/GitHub App exchange, bounded request/egress controls.
- distributed rate-limit and OIDC replay Durable Objects.
- central-review/commercial-readiness/product-development/readiness/acquisition workflow 계열과 policy/test 기반.
- evidence-class separation을 반영한 maintenance policy code.
- configured 100% production coverage and reviewer-quality gates.
- PR #71 branch의 exact workflow-ref/SHA runtime readiness 및 architecture documentation changes.

마지막 항목은 PR #71이 merge되기 전 protected-main `Implemented`가 아니라 **implemented on this PR branch**입니다.

## Planned

- PR #76 dependency remediation integration.
- PR #78 deterministic repository-level Node/npm/lockfile controls.
- PR #80 work-conserving RCA/feasibility protocol, deliverable handoff와 atomic branch/PR publisher.
- PR #65/#67 quarantined patch validator / validator image chain.
- PR #88 runner assignment audit가 `runner_assignment_evidence`를 read-only operational evidence로 구현하고 issue #30의 org-level root cause와 분리하는 작업.
- protected-main operational acceptance of enabled hourly maintenance.
- release/deployment provenance chain의 실제 production acceptance.

## External evidence

repository source만으로 충족되지 않는 항목:

- issue #27 enforceable `main` governance/ruleset and direct-push rejection.
- issue #29 Maintainer/Reviewer App installation, exact permissions, variables/secrets, activation and rollback.
- issue #30의 historical/intermittent runner-assignment root cause를 확정하는 organization-level Actions billing/policy/runner-group evidence.
- private vulnerability-reporting repository setting and benign exercise where required.
- production environment protection and independent reviewer configuration.
- production KPI/log provenance, deployment receipts/attestations.
- customer, revenue, transfer, IP/license, support ownership evidence.

## 17. References

설계의 표준·primary-source 근거와 APA 7th bibliography는 `docs/doctoring/architecture-trust-boundaries.md`를 canonical source로 사용합니다. 세부 API/운영 근거는 해당 doctoring/runbook의 source verification note를 따릅니다.