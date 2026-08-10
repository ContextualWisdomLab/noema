# Noema Product Requirements Document

## Status

**Proposed canonical PRD — In review on PR #71.** 이 문서는 protected `main`에 병합되기 전에는 protected-main authority가 아닙니다. Current protected-main reference for this refresh is `c85d710804139c0697d7ef8fa47d02b1389e6d84`; active PR behavior remains `Proposed` or `In review` until protected integration and operational acceptance.

Noema is not merely an LLM review bot. Its product boundary is an evidence-producing credential and maintenance control plane that verifies GitHub Actions identity, exchanges it for repository-scoped GitHub App capability, and prevents check, status, scanner, model, review, merge, release and deployment authorities from collapsing into one another.

## 1. Users and stakeholders

### Primary users

- **Repository maintainer:** combines exact-head source, current-base, CI, security, review and governance evidence before integration.
- **Security/platform operator:** configures and verifies GitHub Apps, OIDC, Cloudflare Worker bindings, Durable Object state, credential scope, deployment and rollback.
- **CWL service owner:** consumes Noema through a versioned API/OIDC/evidence contract from `.github`, `contextual-orchestrator`, `naruon` or another service.

### Secondary users

- **Independent reviewer:** supplies an eligible formal GitHub review, not a model verdict or status substitute.
- **Acquisition/due-diligence reviewer:** verifies source, security, release, deployment, operations, commercial and transfer evidence without relying on chat or PR-body archaeology.
- **Developer/coding agent:** uses beginner-readable docs and executable contracts to change Noema without crossing authority boundaries.

## 2. Problems to solve

1. Long-lived broad credentials in GitHub Actions increase the blast radius of workflow compromise.
2. A moving branch, stale PR head, predecessor check or synthetic integration revision can be mistaken for current source authority.
3. Check runs, commit statuses, scanner output, review comments and model judgements can all look “green” while carrying different meanings.
4. A model runner that also owns repository write credentials couples untrusted source and model output to mutation authority.
5. One pending check, reviewer delay, provider cooldown or scheduler error can stall all useful work unless the queue is explicitly work-conserving.
6. Architecture and product decisions stored only in conversation or PR bodies cannot be independently reconstructed by operators or buyers.
7. A prompt update, inventory, RCA, RED test, documentation assessment, commit, PR, merge or blocker can be mistaken for completion while a safe next boundary remains.
8. Release, deployment, customer, revenue, ownership or transfer claims can be overstated when repository text is allowed to substitute for real evidence.

## 3. Product principles

- **Least privilege:** capability is scoped by role, repository, lifetime and operation.
- **Exact revision before authority:** current immutable source identity is required before evidence can influence a privileged decision.
- **Evidence is not authority:** check, status, runner assignment, scanner, review, model, merge, release and deployment remain distinct planes.
- **Fail closed:** missing, malformed, stale, predecessor, partial, pending or ambiguous evidence is not passing.
- **Standalone first, composable second:** Noema operates independently and integrates with CWL services through versioned contracts.
- **Work conserving:** a blocked lane is deferred by exact identity while another safe lane proceeds.
- **Deliverable handoff:** every intermediate artifact advances to the next safe implementation, review, merge or operational boundary.
- **No self-repair privilege escalation:** no repair workflow, self-modifying Action, branch-patching workflow, force push or synthetic approval replaces the reviewed write path.
- **Evidence-backed commercial claims:** production, release, customer, revenue, transfer and certification claims require independent evidence.

## 4. Product modes

### 4.1 Credential exchange

A Cloudflare Worker exposes `/health`, `/ready` and `/exchange`. It validates GitHub Actions OIDC identity, exact workflow ref/SHA, target authorization, rate/replay state and bounded credential-bearing requests before minting a repository-scoped installation token.

### 4.2 Independent review composition

A central review workflow may use Noema capability and a distinct Reviewer App identity to collect and publish bounded review evidence. Noema does not turn model output into formal approval and does not own upstream model-provider keys when `contextual-orchestrator` is the routing plane.

### 4.3 Commercial-readiness maintenance

A trusted default-branch workflow inventories open PRs/issues, exact heads, live bases, checks, formal reviews, threads, statuses, security and governance. Mutation requires a distinct Maintainer App capability and must refuse stale identity. Activation remains external until issue #29 evidence exists.

### 4.4 Product-development proposal

When the executable queue permits, OpenCode may use `NVIDIA_NIM_API_KEY` to produce a bounded proposal. The model runner receives no repository write credential; an uncredentialed verifier checks immutable source/patch evidence; a separate publisher reconstructs but does not execute the patch. This mode cannot approve, merge, release or deploy.

### 4.5 Exact patch quarantine

Noema may validate an exact repository patch through a typed, credential-free, no-network, non-root quarantine profile. The sandbox returns untrusted result bytes; a trusted host verifies and synthesizes retained evidence. PR #93 is the current clean protected-main successor for this capability; image publication/activation remains a separate issue #66 boundary.

### 4.6 Acquisition evidence

Noema indexes technical, security, release, deployment, commercial and transfer evidence. Missing real-world evidence remains `NOT_READY`; persisted green booleans, bare URLs or artifact metadata cannot manufacture acquisition authority.

## 5. Functional requirements

| ID | Requirement |
| --- | --- |
| FR-001 | `/health` reports liveness, `/ready` reports credential-exchange readiness, and `/exchange` performs only credential exchange. |
| FR-002 | Validate OIDC issuer, audience, organization/repository, exact workflow ref and paired immutable workflow SHA. |
| FR-003 | For reusable workflows, bind `job_workflow_ref` and `job_workflow_sha`; validate caller metadata independently without mixing malformed claim families. |
| FR-004 | Restrict target repository and credential-bearing OIDC/GitHub egress to reviewed destinations and request shapes. |
| FR-005 | Coordinate replay protection and pre-auth rate limiting through durable cross-isolate state. |
| FR-006 | Bound credential-bearing request/response size, timeout, redirect, origin and logging behavior. |
| FR-007 | Distinguish exact current head, PR-base snapshot, independently resolved live base, stack predecessor and synthetic integration revision. |
| FR-008 | Keep check runs, runner assignment, commit statuses, scanner evidence, formal reviews and model judgement non-substitutable. |
| FR-009 | Collect every material pagination page or classify evidence incomplete. |
| FR-010 | Immediately before mutation, refetch current head/base/ref/blob and refuse a moved target or competing writer. |
| FR-011 | Classify findings as current-valid, stale, duplicate, incorrect, superseded, infrastructure or policy before action. |
| FR-012 | Merge only when unchanged current head satisfies live governance, required checks/security, zero valid unresolved findings and qualifying independent approval where required. |
| FR-013 | Use OpenCode and `NVIDIA_NIM_API_KEY` for model-backed development; never use `COPILOT_GITHUB_TOKEN`. |
| FR-014 | Separate model runner, uncredentialed verifier and credential-bearing publisher trust domains. |
| FR-015 | Bind branch/PR publication to exact source and conditional mutation; cleanup may remove only run-owned exact identities. |
| FR-016 | Fail closed when operational, release, deployment, legal, commercial or transfer evidence is absent or inconsistent. |
| FR-017 | Keep one discoverable canonical PRD/TRD/Architecture/ADR/UML/ERD/traceability/security/test/operability/licensing graph in GitHub. |
| FR-018 | Continue consuming the safe executable queue after one lane blocks or a generic scheduler error occurs. |
| FR-019 | A prompt update, inventory, documentation assessment, design, RCA, test, commit, review request, merge or blocked lane is an **intermediate artifact** and must hand off to the next safe source, review, integration or operational boundary. |

## 6. Non-functional requirements

### Security and privacy

- Keep reviewer, maintainer, model, OIDC publication, release and deployment credentials separate.
- Do not execute untrusted PR source or model output in a credential-bearing publisher.
- Test hostile JSON/UTF-8, oversized bodies, redirects, destination confusion, replay, stale identity, symlink/special-file and forged-evidence paths realistically.
- Retained evidence must omit raw secrets, bearer tokens, private keys and unnecessary personal data.

### Reliability and observability

- Liveness and readiness are distinct.
- Pending/review/provider latency is a lane defer, not a global stop.
- Runner assignment is operational evidence, never check success.
- Writes are conditional, reversible where possible and bounded by exact cleanup identity.
- RCA, design, test, documentation, PR and merge each hand off to the next executable boundary.
- A double exit sweep is required before an invocation may stop.

### Quality and accessibility

- Owned production statements, branches, functions and lines remain at exact 100% when exposed by tooling.
- Public APIs and reviewer surfaces require meaningful beginner-readable documentation, not regex-only filler.
- Tests prefer real Request/Response, WebCrypto, GitHub/Cloudflare contracts and adversarial fixtures over broad mocks or exclusions.
- Human-readable docs and machine-readable evidence must agree on identity, status and authority.

### Supply chain and acquisition

- Pin GitHub Actions by immutable commit SHA.
- Bind Node/npm identity and lockfile regeneration/change control.
- Fail closed on unreviewed dependency lifecycle scripts.
- Release evidence requires exact package/artifact identity, SBOM, provenance, dependency-license/NOTICE and rights consistency.
- Automation never chooses an outbound license or fabricates contributor/IP transfer evidence.

## 7. CWL interoperability

- `.github` is the central workflow/policy plane and a read-only dependency while its dedicated writer is active.
- `contextual-orchestrator` is the preferred model-routing plane; Noema does not duplicate provider routing or secrets.
- `naruon` and other services consume versioned API/OIDC/evidence contracts rather than importing Noema internals.
- Repositories with dedicated writers remain read-only to the Noema loop.

## 8. Acceptance semantics

Completion stages remain separate:

1. implemented on an active branch;
2. exact-head CI/security/review evidence available;
3. protected merge completed;
4. protected-main operational acceptance completed;
5. immutable release evidence completed;
6. production deployment/environment evidence completed;
7. commercial/acquisition evidence completed.

An earlier stage never proves a later stage. A prompt, documentation update, RED/GREEN test, commit, PR or merge is an intermediate artifact whenever the next safe stage is executable.

## Implemented

Protected-main and repository-owned surface currently include:

- credential-exchange routing and bounded OIDC/GitHub App request/egress controls;
- distributed rate-limit and OIDC replay-state families;
- central review, readiness, acquisition, maintenance and product-development workflow/control families;
- evidence-class separation and exact configured 100% coverage gates;
- Maintainer/Reviewer App preflight logic, though live provisioning/activation remains external;
- protected PR #76 remediation at `c85d710804139c0697d7ef8fa47d02b1389e6d84`, including `nanoid@3.3.17` and exact-head CI identity controls.

Exact protected behavior is determined by live source and operational evidence, not this list alone.

## Planned

The following current owners remain Proposed/In review until protected integration:

- PR #71 — canonical documentation graph and immutable workflow-source trust.
- PR #80 — atomic proposal publisher, scheduler continuation and credential compartment.
- PR #83 / issue #81 — verified replay claim before GitHub token mint.
- PR #86 / issue #82 — deterministic public TypeScript API documentation gate.
- PR #90 / issue #27 — governance audit and corrected central Security Scan guidance.
- PR #91 / issues #77 and #79 — exact Node/npm, lifecycle-script and lockfile change control.
- PR #92 / issue #29 — private-target reviewer authentication; live App provisioning remains external.
- PR #93 / issue #9 — clean exact patch-quarantine successor.
- PR #94 / issue #30 — read-only runner-assignment evidence, stacked on #91.
- PR #69 / issue #68 — acquisition manifest integrity after #91 convergence.
- PR #72 / issue #73 — disclosure policy versus live private-reporting operation.
- PR #67 / issue #66 — validator image rebuild, publication, signing, attestation and activation after #93.
- Issue #84 — remove broad V8 exclusions from credential-exchange security code after shared-source ownership stabilizes.

Historical PR #65, #78, #85, #87, #88 and #89 are predecessor/superseded lineage, not current implementation authority.

## External evidence

Repository source cannot complete:

- issue #27 live `main` ruleset, direct-push/force-push/deletion rejection and reviewed break-glass evidence;
- issue #29 Maintainer/Reviewer App installation, exact effective permissions, secret/variable, reviewer eligibility, activation and rollback;
- issue #30 historical organization Actions billing/policy/runner-group RCA;
- issue #73 private vulnerability-reporting setting, notification ownership and benign exercise;
- issue #40 protected production environment and independent deployment review;
- issue #3 production 30-day KPI/log provenance;
- immutable release publication, production deployment/attestation and rollback/recovery evidence;
- customer/pilot, revenue/LOI/pipeline, support ownership, owner/legal rights and contributor/IP transfer evidence;
- actual external scheduler state proving one enabled hourly task uses the current compact prompt and continues after generic task errors.

Missing external evidence remains fail closed; documentation must not replace it.

## 9. Explicit non-goals

- Treat model output, comment, reaction, status or scanner result as formal approval.
- Use Copilot credentials for autonomous development.
- Add self-modifying or branch-repair workflows to work around normal write authority.
- Weaken branch, review, security, coverage, package or release gates for automation convenience.
- Invent production KPI, release, customer, revenue, ownership, transfer or certification proof.
- Create a physical database ERD before Noema owns that persistence.
- Add ADRs or diagrams solely to increase document count.

## 10. Product acceptance checklist

- [ ] Canonical documentation graph matches current protected source and active successors.
- [ ] Exact-head/live-base/workflow/reviewer/evidence semantics remain executable.
- [ ] Work-conserving queue and FR-019 handoff are repository-tested and operationally observed.
- [ ] Exact 100% owned coverage and public-documentation gates pass without broad unjustified exclusion.
- [ ] Security, dependency, package and provenance gates pass without waiver.
- [ ] Live ruleset and qualifying independent approval are verified.
- [ ] Maintainer, Reviewer, model and deployment identities are role-separated and operationally proven.
- [ ] Protected-main acceptance follows every protected merge.
- [ ] Release/deployment, when attempted, bind provenance, SBOM, rights, rollback and recovery to one immutable source.
- [ ] Acquisition claims include real commercial, operational and transfer evidence.

## 11. Related authority

- `docs/TRD.md` — technical requirements and exact evidence semantics.
- `ARCHITECTURE.md` — runtime, trust, MSA and authority planes.
- `docs/adr/` — durable decisions and status.
- `docs/UML.md` — component, sequence, state and deployment views.
- `docs/ERD.md` — persisted state versus conceptual evidence model.
- `docs/TRACEABILITY.md` — requirement → decision → source/test/evidence mapping.
- `docs/TEST_STRATEGY.md` — realistic validation and exact coverage policy.
- `docs/OPERABILITY.md` — activation, incident, recovery and operational evidence.
- `docs/DOCUMENTATION_GAP_AUDIT.md` — design sufficiency versus protected-main operational sufficiency.
- Runtime and automation threat models — separate threat surfaces.
- `docs/LICENSING_AND_IP_TRANSFER.md` — owner/legal and exact-release rights boundary.
