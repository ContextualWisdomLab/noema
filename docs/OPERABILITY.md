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
| External-extension lifecycle | exact admitted artifact의 Noema lifecycle authority가 restart/CAS/replay/rollback 뒤에도 보존되는가 | Durable Object current projection, append-only audit/recovery receipt, contention/storage-growth evidence |
| Procedural graph advisory | execution-local procedural context와 candidate screening이 activation authority로 오인되지 않는가 | exact source/tests, local graph/session admission evidence, explicit abstention/rejection reason, `activationAuthorized: false` |
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

운영 traffic readiness는 `/health` 하나가 아니라 `/ready`와 실제 bounded smoke contract를 함께 사용합니다. The protected procedural graph source is library-only and must not be inferred from these HTTP health/readiness surfaces.

## 4. Deployment configuration inventory

운영자는 secret **값**이 아니라 필요한 binding/owner/rotation metadata를 관리합니다.

Worker/runtime category:

- GitHub App identifier/private-key binding;
- optional installation identity;
- GitHub API exact origin;
- allowed organization/repository/workflow ref;
- immutable allowed workflow SHA;
- rate-limiter and replay-guard Durable Object namespaces;
- configured request-rate policy;
- external-extension lifecycle Durable Object binding/namespace when that slice is deployed for operational acceptance.

GitHub automation category:

- Maintainer App client identity and private key;
- exact reviewer App bot login;
- maintenance activation flag;
- contextual-orchestrator gateway endpoint `NOEMA_LLM_API_URL`;
- dedicated gateway inference token `NOEMA_LLM_API_KEY`;
- routing alias `orchestrator/free`;
- reviewer model gateway credential contract, kept separate from repository publication authority.

Upstream provider credentials such as `NVIDIA_NIM_API_KEY`, `NVIDIA_NIM_API_KEY_SUB`, `BYTEZ_API_KEY`, `OPENROUTER_API_KEY`, and `OPENAI_API_KEY` are not Noema model-job configuration. Provider discovery, model selection, retries, failover, and paid/free routing remain contextual-orchestrator authority.

The protected procedural graph source, including #597 State / Checkpoint evaluation-history persistence and protected #601's separate Noema Policy / Approval CAS ledger, adds **no deployment binding, secret, provider selector, cron, HTTP route, graph publication, or activation authority**. Any operational Durable Object binding or activation path must be a separately reviewed change that freshly reconciles its current State / Checkpoint and Policy / Approval authorities with the released owner contract, live signer trust, lifecycle, canary, and rollback evidence.

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

External-extension lifecycle observability may expose bounded stream identity, version/state, transition ID, CAS/replay/conflict reason, digest/reference identities, latency and storage-growth metrics. It must not emit plugin prompt plaintext, raw product data, hidden reasoning, raw secrets, provider credentials, or editable copies of foreign-owner verdict/policy state.

Procedural graph diagnostics may retain bounded tenant/task/execution-safe identifiers, graph/structure digest, advisory availability, abstention/rejection reason and evaluation-case counts required for troubleshooting. They must not turn raw graph guidance/pitfall text, product payload, evaluator hidden reasoning, provider credentials or unauthenticated score material into durable operational evidence. `eligibleForApproval` and digest equality are not activation metrics.

### Service indicators

Current operational materials define KPI/alert tooling for exchange failure and latency. Release/deployment acceptance must distinguish:

- synthetic/local test metrics;
- scheduled/report-only absence;
- real production KPI logs with provenance and required window.

A non-strict `SKIP` because no production log exists is not production SLO proof.

For external-extension lifecycle evidence, record current-projection and contended-append latency separately. The target is p95 ≤20 ms where that path is synchronous buyer/runtime authority. O(1) storage cardinality, unit timing, a reduced sample, or cache-only warmup is not that evidence. Record the actual Durable Object backend, request count/window, contention pattern, stream cardinality, storage size and exact source/deployment identity used for the measurement.

The protected procedural graph library source has no production p95 claim because it has no deployed synchronous buyer path. If procedural graph lookup later enters such a path, measure the real end-to-end path under representative graph sizes and concurrency rather than promoting unit timing to production latency evidence.

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

### Procedural graph integrity incident

A forged/cross-scope graph/session, graph identity mismatch, unsafe descriptor, unknown procedure, exceeded context budget, evaluation-context mismatch, holdout leakage, safety regression or malformed score is a **local advisory/candidate-screening failure**, not permission to substitute another graph or widen context. Reject/abstain and retain bounded diagnostic identity. A product/runtime caller must not fall back to unbounded graph disclosure, a mutable sibling source, model-generated tool authority, or automatic activation. A stale caller-supplied `running` lifecycle snapshot is likewise not evidence of current authorization; current-state/revocation authority must be obtained from its owning durable boundary before guidance is treated as current.

### GitHub Actions queue incident

Queued/pending runs are not success. RCA should distinguish runner/billing/provider/event-trigger/repository policy. While queue evidence is unchanged, rotate to work that does not require that run to finish.

### Durable Object/state incident

Malformed/unavailable state decision fails credential issuance or lifecycle mutation. Before deleting state, distinguish current active claim/window from stale cleanup and preserve rollback implications.

For external-extension lifecycle state, never “repair” corruption by editing/deleting prior events, copying current mutable owner truth into historical events, auto-rebasing a failed CAS, or truncating early history to recover capacity. Quarantine the affected stream from new activation/invocation as applicable, retain exact head/tail/version/storage evidence, run complete audit-chain verification, and recover only from a verified snapshot/event prefix or platform recovery point whose continuity can be proved. PITR can restore storage but does not become the canonical audit ledger.

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

### External-extension lifecycle

- rollback/suspension/supersession/expiry is a new append-only lifecycle transition against the current expected version/head, not mutation of the prior `active` event;
- revoking current Noema Policy / Approval stops genuinely new activation/invocation according to the admission contract but does not erase historical lifecycle evidence;
- foreign scanner, quarantine/isolation, egress, identity/secret, or model-routing rollback remains the canonical owner's operation and is referenced by immutable receipt/profile identity rather than copied into Noema;
- if lifecycle storage schema or binding changes, restore/rehearse the exact migration and prefix-continuity path before reactivation.

### Procedural graph advisory

The protected procedural graph source has no activation or graph-publication authority to roll back. Protected #597 State / Checkpoint history and protected #601 Policy / Approval CAS are append-only evidence boundaries, so rollback must preserve their acknowledged history rather than rewrite it. Source rollback is an ordinary reviewed source rollback. The #586 execution adapter does not make a stale `running` snapshot current; callers must reacquire current lifecycle authority from its owner. If a graph is later activated, rollback must append/reconcile a current Policy / Approval revocation against the exact retained history and canary identity; deleting or mutating an old graph digest or treating a lower-scoring candidate as automatically active is not acceptable.

## 12. Recovery acceptance

Recovery is complete only when the exact recovered source/configuration has:

- current health/readiness;
- relevant request smoke;
- no secret leakage in logs/artifacts;
- exact workflow trust;
- policy/security checks;
- operational identity proof;
- rollback record and incident owner.

For an external-extension lifecycle stream, recovery additionally requires: current projection matches the verified audit tail; complete retained event ordering, prior-event hash chain, request/event digests and stream identity verify; restart reconstructs current state without client-supplied authority; old exact replay still returns the historical event/snapshot; new activation rechecks live Noema Policy / Approval and owner evidence; suspension/rollback state remains effective; and any snapshot/segment rotation proves continuity with the retained immutable prefix.

Procedural graph process-local admission is recreated from trusted caller input after process restart and is not itself recovery evidence. Protected #597 provides bounded State / Checkpoint evaluation/rejection history and protected #601 provides a separate Policy / Approval CAS ledger; recovery must verify each retained digest chain/version and then freshly reconcile both authorities with current lifecycle/revocation, signer trust, canary, and publication evidence before claiming that any previously active graph is safe to restore. Neither retained ledger alone is activation authority.

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

External-extension lifecycle retention is append-only audit evidence rather than a bounded observability ring. Storage/segmentation policy must preserve the exact event prefix and head continuity; capacity management cannot delete early lifecycle evidence. The persisted schema remains payload-minimized and reference/digest based.

Protected #597 retains bounded procedural evaluation/rejection history under State / Checkpoint, and protected #601 separately retains exact Policy / Approval CAS approval/revocation events. Both stores are payload-minimized evidence boundaries: they retain graph/evaluation/authenticated-handoff/version/digest references needed for replay, integrity and recovery, but not raw product data, secrets, hidden reasoning, provider credentials, graph-domain truth or publication/activation authority. A lifecycle snapshot supplied to the process-local adapter is not a retained revocation ledger.

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

Runtime health/exchange, readiness/security state, maintenance/development workflows, external-extension admission/lifecycle, procedural graph advisory/session/screening and lifecycle-gated projection, authenticated procedural evaluator handoff, #597 State / Checkpoint evaluation/rejection history, #601 Policy / Approval CAS, and evidence scripts exist in protected source. Exact deployed revision is always live-verified rather than inferred from this document. Protected source does not by itself prove real-backend p95/recovery, live signer trust, current non-workflow lifecycle/revocation, publication-time cross-authority reconciliation, graph publication, immutable release, canary/rollback, product outcome, or deployment.

### External / not yet proven by source

- issue #27 enforced `main` governance;
- issue #29 Maintainer/Reviewer App provisioning and activation;
- production environment independent governance;
- actual Durable Object external-extension lifecycle deployment, realistic current-projection/contended-append p95, partition/storage-growth evidence, snapshot rebuild and recovery rehearsal;
- procedural graph released cross-service schema, live owner/Keyverse signer trust selection, non-workflow current-lifecycle/revocation authority, deployed State / Checkpoint and Policy / Approval compatibility/p95/recovery, fresh publication-time State / Checkpoint plus Policy / Approval reconciliation, graph publication, canary/rollback operation and product outcome improvement;
- current production KPI/deployment/release acceptance;
- commercial/revenue/transfer completeness.

## 17. External extension admission and rollback

External Claude community plugins are handled only through Noema's Tool / Capability admission port. Marketplace metadata, a scanner PASS, an isolation receipt, or a structurally compatible caller object is not invocation authority.

Operational invariants:

- only the composite authority instance bound when Noema admits an extension may mediate later activation and invocation; swapping in a lookalike catalog/scan/policy port fails closed;
- activation and every invocation re-read the live admission-bound Policy / Approval authority, while invocation also revalidates the exact catalog and AppGuardrail/quarantine receipt identities through that same bound trust channel;
- policy revocation or drift, catalog drift, missing/revoked scan evidence, expired validity, rollback marking, activation mismatch, or replay-envelope conflict stops new use rather than falling back to stale admission evidence;
- the Claude wrapper is `developer_assist` only. Product-runtime adoption must use the canonical product owner's released protocol/API through its own port and ACL;
- AppGuardrail and quarantine remain scanner/provenance and isolation owners, EgressWeave remains outbound-policy owner, Keyverse remains identity/secret-handle owner, and contextual-orchestrator remains model/provider-routing owner. Noema stores references and admission authority; it does not duplicate those implementations;
- raw provider credentials, product records, secrets, hidden reasoning, and unrestricted filesystem/network/process/MCP capabilities never become extension receipts or implicit runtime authority.

Rollback for the Noema-owned portion means suspending/revoking the applicable Policy / Approval grant or appending the appropriate lifecycle suspension/supersession/expiry transition so new activation/invocation fails closed. Disabling an installed developer workspace plugin, terminating quarantine execution, changing outbound policy, rotating secrets, or repairing scanner evidence stays with the corresponding canonical owner and must be evidenced separately.

A protected source merge proves only source integration. Live plugin installation, immutable shared-contract consumption, AppGuardrail/quarantine/EgressWeave operation, lifecycle Durable Object deployment/performance/recovery, measured pilot value, release publication, and rollback rehearsal remain separate evidence classes and must not be inferred from source tests or PR checks.

## 18. External-extension lifecycle operating procedure

The lifecycle stream is Noema State / Checkpoint evidence keyed by extension plus exact admitted source/artifact identity. Operators should treat the current projection and full audit as different evidence surfaces.

For a current-state read:

1. resolve the canonical stream identity from the exact admitted artifact;
2. read the compact head and its exact tail event;
3. verify schema, stream, version/state/head binding and retained request/event digests;
4. fail closed if the head or tail is missing, malformed, cross-stream or inconsistent;
5. do not scan the full retained history on the latency-sensitive current path solely to manufacture confidence.

For audit/recovery:

1. list the complete retained event prefix in sequence order;
2. verify version continuity, prior-event digest chain, request digest, event digest and stream identity for every event;
3. verify the compact head equals the terminal event;
4. verify early events remain present after >128 transitions and after any snapshot/segment operation;
5. reconcile rollback/suspension/supersession against current Policy / Approval without rewriting history.

For a new `active` append, fresh Policy / Approval and foreign-owner evidence must be read immediately before the CAS path. Exact duplicate requests first consult durable idempotency evidence. If a writer misses that index, another writer commits the exact activation, and live evidence then fails, the loser may return replay only after the newly committed request/event/head/tail passes immutable verification. This exception preserves idempotency of historical evidence; it does not permit a new activation under revoked authority.

Operational acceptance is pending until the actual Durable Object binding demonstrates realistic latency/contention/storage/recovery behavior and a protected/released/deployed source identity is retained with the measurement. Until then ADR 0015 stays Proposed and #561 remains open.

## 19. Procedural graph operational acceptance

The protected procedural graph source has a deliberately short operating contract because it is a library boundary rather than an activated service. Protected #601 adds Noema-owned point-in-time Policy / Approval CAS approval/revocation evidence, but every retained event/snapshot remains `activationAuthorized:false`; a successful CAS is not graph publication or durable activation authority.

1. Accept only exact descriptor-safe tenant/task graph input through the module-owned admission path.
2. Bind a session to the same tenant/task, canonical execution ID and expected graph digest; copied/forged/proxy lookalikes are not runtime capabilities.
3. Before execution projection, require the caller to obtain a fresh authenticated lifecycle snapshot for the same execution identity; only `running` may receive guidance. The adapter does not become the durable freshness/revocation store.
4. Return only bounded local advisory context; unknown procedure or exhausted budget abstains rather than widening disclosure.
5. Screen a candidate only as an admitted direct child under exact paired held-out evaluation context with no train/holdout identity overlap.
6. Treat any safety violation or measured mean regression as rejection even when other metrics improve.
7. Preserve `activationAuthorized: false` for every candidate, State / Checkpoint history event, and Policy / Approval event/snapshot. `eligibleForApproval` and `approved_for_pilot` are evidence for later boundaries only.
8. Before any graph publication or activation, require a released owner contract, live owner/Keyverse signer-trust selection, current non-workflow lifecycle/revocation evidence where applicable, deployed State / Checkpoint and Policy / Approval compatibility, a fresh publication-time read/reconciliation of both current authorities, and canary/rollback evidence. None of these may be inferred from a prior #601 CAS success.

There is therefore no current procedural-graph production traffic, rollback metric or durability SLO to claim. A future activation change must add those operational evidence classes rather than retrospectively interpreting source/unit-test integration as production acceptance.
