# Noema Operability and Operational Acceptance

## 1. Purpose

이 문서는 Noema의 **실행 중인 서비스**, **GitHub automation**, **외부 governance/configuration**을 운영자가 구분해서 점검하도록 합니다. Code merge는 operational activation이 아니며, production deployment는 commercial readiness가 아닙니다.

## 2. Operational planes

| Plane | Operator concern | Primary evidence |
| --- | --- | --- |
| Credential exchange | Worker가 올바른 trust binding으로 안전하게 token을 교환하는가 | `/health`, `/ready`, `/exchange` smoke, Cloudflare config/runtime logs |
| Independent review | correct reviewer identity/model route가 exact head를 검토하는가 | workflow run, formal review, evidence manifest |
| Commercial maintenance | Maintainer App이 정확한 policy 아래 안전하게 dispatch/merge하는가 | governance audit, loop report, merge/downstream-run evidence |
| Product development | OpenCode proposal이 bounded/uncredentialed이고 publication이 분리되는가 | proposal artifact, verifier, publisher run evidence |
| Release | protected integrated source에서 immutable artifact가 만들어졌는가 | package/SBOM/provenance/publication receipt |
| Deployment | production environment가 reviewed release를 안전하게 활성화했는가 | environment governance, deployment/smoke/KPI receipt |
| Acquisition | buyer가 technical + commercial + transfer evidence를 재검증할 수 있는가 | data-room manifest and independent validators |

## 3. Liveness, readiness, and service acceptance

### `/health`

프로세스 liveness입니다. 200이더라도 credential exchange의 trust/config가 완전하다는 뜻이 아닙니다.

### `/ready`

외부 network call/token minting 없이 현재 runtime binding이 credential exchange에 적합한지 검증합니다. 실패 시 설정값을 반사하지 않고 bounded failed-check identifier만 반환합니다.

### `/exchange`

실제 credential-bearing protocol입니다. readiness가 녹색이어도 request-specific OIDC/repository/ref/SHA/replay/rate-limit/GitHub App validation은 별도로 통과해야 합니다.

운영 traffic readiness는 `/health` 하나가 아니라 `/ready`와 실제 bounded smoke contract를 함께 사용합니다.

## 4. Deployment configuration inventory

운영자는 secret **값**이 아니라 필요한 binding/owner/rotation metadata를 관리합니다.

Worker/runtime category:

- GitHub App identifier/private-key binding;
- optional installation identity;
- GitHub API exact origin;
- allowed organization/repository/workflow ref;
- immutable allowed workflow SHA;
- rate-limiter and replay-guard Durable Object namespaces;
- configured request-rate policy.

GitHub automation category:

- Maintainer App client identity and private key;
- exact reviewer App bot login;
- maintenance activation flag;
- contextual-orchestrator gateway endpoint `NOEMA_LLM_API_URL`;
- dedicated gateway inference token `NOEMA_LLM_API_KEY`;
- routing alias `orchestrator/free`;
- reviewer model gateway credential contract, kept separate from repository publication authority.

Upstream provider credentials such as `NVIDIA_NIM_API_KEY`, `NVIDIA_NIM_API_KEY_SUB`, `BYTEZ_API_KEY`, `OPENROUTER_API_KEY`, and `OPENAI_API_KEY` are not Noema model-job configuration. Provider discovery, model selection, retries, failover, and paid/free routing remain contextual-orchestrator authority.

Secret values must not be copied into runbooks, PR bodies, model prompts, retained artifacts or acquisition evidence.

## 5. Maintainer App activation

Issue #29 is the canonical external-operational acceptance workstream. Activation order:

```text
create separate Maintainer App
→ install only on noema
→ verify exact permissions
→ configure client ID/private key/reviewer login
→ leave maintenance disabled
→ prove pre-activation skip
→ run operations preflight / governance checks
→ activate maintenance
→ execute bounded validation
→ prove App-authored merge triggers downstream main workflows
→ retain rollback/rotation ownership evidence
```

A missing App or secret is not solved by adding a `GITHUB_TOKEN` write fallback.

## 6. Main governance acceptance

Issue #27 is the canonical source-control governance workstream. Required external proof includes:

- pull-request enforcement for `main`;
- direct push rejection for normal maintainer identity;
- required exact-head/integration checks as deliberately classified;
- current eligible independent approval when policy requires it;
- stale approval dismissal;
- conversation resolution;
- force-push and branch-deletion rejection;
- explicit auditable break-glass path;
- auto-merge only after the same effective conditions.

Repository documentation or a local policy script does not prove that GitHub is enforcing these rules.

## 7. Hourly maintenance operating procedure

At each run:

1. collect fresh open PR inventory and exact source identities;
2. gather complete checks/status/reviews/threads and live policy evidence;
3. merge genuinely clean items first;
4. dispatch only eligible missing exact-head review;
5. defer pending/external items and continue other safe work;
6. collect a fresh remaining queue after mutations;
7. if queue is empty, run report-only readiness/acquisition refresh as configured;
8. retain bounded report artifacts.

The external hourly scheduler follows the same work-conserving contract across broader development/documentation tasks. Routine status output is not a stopping mechanism.

## 8. Product-development operating procedure

The proposal flow must preserve three trust domains.

### Proposal runner

- no repository write credential;
- OpenCode uses only contextual-orchestrator's released gateway contract with routing alias `orchestrator/free`;
- receives `NOEMA_LLM_API_URL` and the dedicated `NOEMA_LLM_API_KEY`, never an upstream provider credential;
- does not define provider/model/group/paid fallback, retry, or model wall-clock timeout policy locally;
- bounded file/diff output;
- no symlink/gitlink authority;
- proposal failure cleanup before the next independent work item.

### Verification runner

- fresh exact base;
- same immutable artifact ID/digest;
- no model/maintainer credential;
- full release verification and staged-patch identity comparison.

### Publication runner

- does not execute proposal code;
- parses model-created metadata as untrusted data;
- revalidates queue/base before minting/using write capability;
- uses late-bound repository-scoped Maintainer App;
- conditionally creates and cleans up only run-owned branch/PR resources.

Atomic proposal-publication and publisher-lease behavior must be judged from the current protected source and exact-head evidence, not from historical PR numbers. Candidate changes are not operationally accepted until they integrate and protected-main execution is observed.

## 9. Observability

### Request-level

Structured operational events use bounded fields such as:

- route/method/status code;
- latency;
- trace identifier;
- policy/error code;
- repository/workflow identity only when safe and needed.

Do not log bearer tokens, GitHub installation token, private key, raw body, raw `jti`, authorization header or provider secret.

### Service indicators

Current operational materials define KPI/alert tooling for exchange failure and latency. Release/deployment acceptance must distinguish:

- synthetic/local test metrics;
- scheduled/report-only absence;
- real production KPI logs with provenance and required window.

A non-strict `SKIP` because no production log exists is not production SLO proof.

### Automation indicators

Track at minimum:

- open/remaining PR count;
- decision/result reason per PR;
- active review dispatch count;
- operational errors;
- stale-head/ref refusal;
- proposal publication failure reason;
- artifact/verifier identity mismatch;
- external gate continuation trigger.

## 10. Incident classification

### Authentication / credential incident

Examples: private key exposure, wrong App scope, unexpected token issuance.

Actions:

1. disable affected maintenance/reviewer/deployment path;
2. revoke/rotate credential or App installation as applicable;
3. retain bounded non-secret event evidence;
4. identify exact source/workflow/repository/time window;
5. verify no hidden fallback credential path exists;
6. restore only after exact configuration and test evidence pass.

### Workflow source incident

If central workflow source changes unexpectedly or `ALLOWED_WORKFLOW_SHA` no longer matches:

- keep `/exchange` fail-closed;
- compare reviewed workflow source and intended change;
- update binding only through reviewed deployment;
- do not replace exact SHA with wildcard/prefix relaxation.

### Provider/model incident

A contextual-orchestrator outage, capability rejection, or upstream condition surfaced by that gateway blocks only model-dependent work. Deterministic governance/security work continues. Noema does not select a direct provider, broaden a model group, add a paid fallback, create its own retry policy, or change reviewer identity/merge gates to work around model latency. Distinguish user cancellation, provider termination, and administrator policy timeout in retained evidence.

### GitHub Actions queue incident

Queued/pending runs are not success. RCA should distinguish runner/billing/provider/event-trigger/repository policy. While queue evidence is unchanged, rotate to work that does not require that run to finish.

### Durable Object/state incident

Malformed/unavailable state decision fails credential issuance. Before deleting state, distinguish current active claim/window from stale cleanup and preserve rollback implications.

## 11. Rollback

### Worker deployment

- deploy previous reviewed source/release identity;
- verify `/health`, `/ready`, `/exchange` smoke;
- verify bindings expected by that source;
- stateful schema/binding changes require migration-specific rollback, not code-only rollback.

### Maintenance automation

- set maintenance activation false;
- revoke Maintainer App if compromise suspected;
- rotate key before reactivation;
- do not add a weaker fallback.

### Product development

- disable the proposal schedule/workflow or revoke/rotate the dedicated `NOEMA_LLM_API_KEY` gateway capability to stop new model proposals;
- do not substitute an upstream provider credential as a rollback path;
- revoke Maintainer App to stop publication;
- existing PRs remain governed by normal review/merge policy.

### Reviewer path

- disable central review dispatch or revoke reviewer App credential as applicable;
- retain formal review history; do not rewrite historical review evidence as if it never existed.

## 12. Recovery acceptance

Recovery is complete only when the exact recovered source/configuration has:

- current health/readiness;
- relevant request smoke;
- no secret leakage in logs/artifacts;
- exact workflow trust;
- policy/security checks;
- operational identity proof;
- rollback record and incident owner.

## 13. Release and production acceptance

A code PR can be merged while release remains not ready. A release can exist while production deployment remains not ready.

Before release:

- protected source identity;
- CI/security/coverage/review;
- package/toolchain reproducibility;
- SBOM/provenance;
- version and CHANGELOG;
- publication receipt.

Before production:

- protected environment governance;
- exact release/source mapping;
- deployment/traffic identity;
- smoke;
- production KPI provenance as required;
- rollback identity.

Before acquisition-readiness claim:

- technical evidence above;
- real customer/pilot/revenue evidence;
- IP/license/credential/operational ownership transfer evidence.

## 14. Evidence retention and privacy

Evidence retention follows data class and existing security/disclosure policy. Broad masking that destroys operational value is not the default. Instead use:

- minimum necessary collection;
- purpose-bound access;
- encryption and secret isolation;
- bounded retention;
- auditability;
- scoped legal/contractual hold where applicable;
- secure deletion evidence that does not retain deleted secrets merely to prove deletion.

Coordinated vulnerability disclosure/retention specifics must be verified from current protected source and the live owner issue/PR before operational acceptance; moving PR numbers are not durable authority.

## 15. Operator runbooks and commands

This canonical operability document does not duplicate every command. Use:

- `docs/runbook.md` — runtime incident/operations commands;
- `docs/hourly-commercial-readiness-loop.md` — maintenance loop operation;
- `docs/operations/hourly-product-development.md` — proposal pipeline;
- `docs/deployment-guide.md` — deployment procedure;
- `docs/observability-kpi.md` — KPI definitions;
- `docs/security-validation-checklist.md` — security evidence;
- `docs/buyer-due-diligence-index.md` — acquisition evidence index.

## 16. Operational evidence status

### Implemented code/control families

Runtime health/exchange, readiness/security state, maintenance/development workflows and evidence scripts exist in repository history/active source. Exact deployed revision is always live-verified rather than inferred from this document.

### Active proposed integration

Active PR state is intentionally not frozen in this canonical operability document. Read the live PR queue, exact heads/bases, dependency ancestry, reviews and current-head gates before treating any proposed integration as current.

### External / not yet proven by source

- issue #27 enforced `main` governance;
- issue #29 Maintainer/Reviewer App provisioning and activation;
- production environment independent governance;
- current production KPI/deployment/release acceptance;
- commercial/revenue/transfer completeness.
